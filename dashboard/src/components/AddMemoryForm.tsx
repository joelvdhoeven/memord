import { useState } from 'react';
import { motion } from 'framer-motion';
import { Save, X } from 'lucide-react';
import type { Memory } from '../api';
import { typeLabel, importanceColor } from '../utils';

const TYPES: Memory['type'][] = ['preference', 'project_fact', 'constraint', 'goal', 'episodic', 'skill'];

interface Props {
  onAdd: (content: string, type: Memory['type'], importance: number) => Promise<void>;
  onCancel: () => void;
}

export function AddMemoryForm({ onAdd, onCancel }: Props) {
  const [content, setContent] = useState('');
  const [type, setType] = useState<Memory['type']>('preference');
  const [importance, setImportance] = useState(0.7);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    setError('');
    try {
      await onAdd(content.trim(), type, importance);
    } catch {
      setError('Failed to save memory. Is memord running?');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900 border border-indigo-500/30 rounded-xl p-5 mb-6 shadow-lg shadow-indigo-500/10"
    >
      <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
        Add Memory
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="What should be remembered?"
          rows={3}
          className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500
            focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all resize-none"
        />

        <div className="flex flex-wrap gap-4 items-end">
          {/* Type select */}
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-gray-500 mb-1.5">Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as Memory['type'])}
              className="w-full h-9 px-3 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200
                focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
            >
              {TYPES.map(t => (
                <option key={t} value={t}>{typeLabel(t)}</option>
              ))}
            </select>
          </div>

          {/* Importance slider */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-gray-500 mb-1.5">
              Importance —{' '}
              <span className="font-semibold" style={{ color: importanceColor(importance) }}>
                {Math.round(importance * 100)}%
              </span>
            </label>
            <input
              type="range" min="0.1" max="1.0" step="0.05"
              value={importance}
              onChange={e => setImportance(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none bg-gray-700 cursor-pointer accent-indigo-500"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-9 px-4 rounded-xl text-sm font-medium border border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
            <button
              type="submit"
              disabled={!content.trim() || saving}
              className="h-9 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500
                shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5
                disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center gap-2"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </form>
    </motion.div>
  );
}
