import { Search, X } from 'lucide-react';
import type { Stats } from '../api';
import { typeColor, typeLabel } from '../utils';

const ALL_TYPES = ['preference', 'project_fact', 'constraint', 'goal', 'episodic', 'skill'] as const;

interface Props {
  search: string;
  onSearch: (v: string) => void;
  typeFilter: string;
  onTypeFilter: (v: string) => void;
  stats: Stats | null;
}

export function SearchFilterRow({ search, onSearch, typeFilter, onTypeFilter, stats }: Props) {
  return (
    <div className="mb-6 space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search memories..."
          className="w-full h-11 pl-10 pr-10 bg-gray-900 border border-gray-700 rounded-xl text-sm text-gray-200 placeholder-gray-500
            focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
        />
        {search && (
          <button
            onClick={() => onSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-colors"
          >
            <X className="w-3 h-3 text-gray-400" />
          </button>
        )}
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onTypeFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
            typeFilter === 'all'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30'
              : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-500 hover:text-gray-300'
          }`}
        >
          All {stats && <span className="ml-1 opacity-70">{stats.total}</span>}
        </button>

        {ALL_TYPES.map(type => {
          const count = stats?.by_type[type] ?? 0;
          if (count === 0) return null;
          const color = typeColor(type);
          const active = typeFilter === type;
          return (
            <button
              key={type}
              onClick={() => onTypeFilter(type)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all border"
              style={active ? {
                backgroundColor: `${color}25`,
                borderColor: `${color}60`,
                color,
              } : {
                backgroundColor: 'transparent',
                borderColor: '#374151',
                color: '#9CA3AF',
              }}
            >
              {typeLabel(type)} <span className="ml-1 opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
