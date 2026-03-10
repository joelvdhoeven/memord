import { motion } from 'framer-motion';
import { Brain, SearchX } from 'lucide-react';

interface Props { search: string; typeFilter: string; }

export function EmptyState({ search, typeFilter }: Props) {
  const isFiltered = search || typeFilter !== 'all';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-24 gap-4"
    >
      <div className="w-16 h-16 rounded-2xl bg-gray-800 border border-gray-700 flex items-center justify-center">
        {isFiltered
          ? <SearchX className="w-7 h-7 text-gray-500" />
          : <Brain className="w-7 h-7 text-gray-500" />
        }
      </div>
      <div className="text-center">
        <p className="text-gray-300 font-medium mb-1">
          {isFiltered ? `No results found` : 'No memories yet'}
        </p>
        <p className="text-sm text-gray-500">
          {isFiltered
            ? search ? `Try different search terms or clear the filter` : `No memories of this type`
            : `Start a conversation and use the remember tool, or add one manually`
          }
        </p>
      </div>
    </motion.div>
  );
}
