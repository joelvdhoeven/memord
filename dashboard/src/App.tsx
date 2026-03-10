import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fetchMemories, searchMemories, fetchStats, fetchOllamaStatus, deleteMemory, addMemory } from './api';
import type { Memory, Stats, OllamaStatus } from './api';
import { Header } from './components/Header';
import { StatsBar } from './components/StatsBar';
import { SearchFilterRow } from './components/SearchFilterRow';
import { MemoryGrid } from './components/MemoryGrid';
import { AddMemoryForm } from './components/AddMemoryForm';
import { LoadingState } from './components/LoadingState';
import { EmptyState } from './components/EmptyState';

// Apply dark mode
document.documentElement.classList.add('dark');

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function App() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mems, st, ol] = await Promise.all([
        fetchMemories(100), fetchStats(), fetchOllamaStatus(),
      ]);
      setMemories(mems);
      setStats(st);
      setOllamaStatus(ol);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!debouncedSearch) { load(); return; }
    setLoading(true);
    searchMemories(debouncedSearch)
      .then(results => setMemories(results.map(r => r.memory)))
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  const filtered = typeFilter === 'all'
    ? memories
    : memories.filter(m => m.type === typeFilter);

  const handleDelete = async (id: string) => {
    await deleteMemory(id);
    setMemories(prev => prev.filter(m => m.id !== id));
    fetchStats().then(setStats);
  };

  const handleAdd = async (content: string, type: Memory['type'], importance: number) => {
    await addMemory(content, type, importance);
    setShowAddForm(false);
    load();
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Header
        ollamaStatus={ollamaStatus}
        onRefresh={load}
        onAdd={() => setShowAddForm(v => !v)}
        showAddForm={showAddForm}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-12">
        {stats && <StatsBar stats={stats} />}

        <AnimatePresence>
          {showAddForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden mb-6"
            >
              <AddMemoryForm onAdd={handleAdd} onCancel={() => setShowAddForm(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        <SearchFilterRow
          search={search}
          onSearch={setSearch}
          typeFilter={typeFilter}
          onTypeFilter={setTypeFilter}
          stats={stats}
        />

        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState search={search} typeFilter={typeFilter} />
        ) : (
          <MemoryGrid memories={filtered} onDelete={handleDelete} />
        )}
      </main>
    </div>
  );
}
