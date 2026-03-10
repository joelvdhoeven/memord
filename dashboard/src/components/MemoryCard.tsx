import { useState } from 'react';
import { motion } from 'framer-motion';
import { Trash2, Clock, Eye, Cpu } from 'lucide-react';
import type { Memory } from '../api';
import { timeAgo, typeColor, typeLabel, importanceColor } from '../utils';

interface Props {
  memory: Memory;
  onDelete: (id: string) => void;
}

export function MemoryCard({ memory, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const color = typeColor(memory.type);
  const impColor = importanceColor(memory.importance);

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete(memory.id);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2500);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="group relative bg-gray-900 border border-gray-700/50 rounded-xl p-4 hover:border-gray-600 hover:shadow-lg hover:shadow-black/20 transition-all duration-200"
    >
      {/* Colored top accent bar */}
      <div className="absolute top-0 left-4 right-4 h-[2px] rounded-full opacity-60" style={{ backgroundColor: color }} />

      {/* Header row */}
      <div className="flex items-center gap-2 mb-3 mt-1">
        {/* Type badge */}
        <span
          className="px-2.5 py-1 text-xs font-bold rounded-full"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {typeLabel(memory.type)}
        </span>

        {/* Topic chip */}
        <span className="px-2 py-0.5 text-xs rounded-md bg-gray-800 text-gray-400 border border-gray-700">
          {memory.topic}
        </span>

        {/* Importance */}
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${memory.importance * 100}%`, backgroundColor: impColor }}
            />
          </div>
          <span className="text-xs font-mono" style={{ color: impColor }}>
            {Math.round(memory.importance * 100)}%
          </span>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-gray-200 leading-relaxed mb-3 line-clamp-4">
        {memory.content}
      </p>

      {/* Tags */}
      {memory.tags && memory.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {memory.tags.map(tag => (
            <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-gray-800 text-gray-500 border border-gray-700">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <Cpu className="w-3 h-3" />
          <span>{memory.app}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>{timeAgo(memory.ingestion_time)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Eye className="w-3 h-3" />
          <span>{memory.access_count}</span>
        </div>

        {/* Delete button */}
        <button
          onClick={handleDelete}
          className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all
            opacity-0 group-hover:opacity-100
            ${confirmDelete
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'hover:bg-gray-800 text-gray-600 hover:text-red-400'
            }`}
          aria-label="Delete memory"
        >
          <Trash2 className="w-3 h-3" />
          {confirmDelete && <span>Confirm?</span>}
        </button>
      </div>
    </motion.div>
  );
}
