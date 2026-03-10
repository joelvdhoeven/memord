import { motion } from 'framer-motion';
import { Database } from 'lucide-react';
import type { Stats } from '../api';
import { typeColor, typeLabel } from '../utils';

interface Props { stats: Stats; }

export function StatsBar({ stats }: Props) {
  const types = Object.entries(stats.by_type).filter(([, c]) => c > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex gap-3 mb-6 overflow-x-auto pb-1 scrollbar-none"
    >
      {/* Total card */}
      <div className="flex-shrink-0 flex items-center gap-3 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 min-w-[140px]">
        <div className="w-9 h-9 rounded-lg bg-indigo-600/20 flex items-center justify-center">
          <Database className="w-4 h-4 text-indigo-400" />
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-100 leading-none">{stats.total}</div>
          <div className="text-xs text-gray-500 mt-0.5">total memories</div>
        </div>
      </div>

      {/* Per-type cards */}
      {types.map(([type, count]) => (
        <div
          key={type}
          className="flex-shrink-0 flex items-center gap-3 bg-gray-900 border border-gray-700/50 rounded-xl px-4 py-3 min-w-[120px]"
          style={{ borderLeftColor: typeColor(type), borderLeftWidth: 3 }}
        >
          <div>
            <div className="text-xl font-bold text-gray-100 leading-none">{count}</div>
            <div className="text-xs text-gray-500 mt-0.5">{typeLabel(type).toLowerCase()}</div>
          </div>
        </div>
      ))}
    </motion.div>
  );
}
