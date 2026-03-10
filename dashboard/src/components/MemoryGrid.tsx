import { AnimatePresence } from 'framer-motion';
import type { Memory } from '../api';
import { MemoryCard } from './MemoryCard';

interface Props {
  memories: Memory[];
  onDelete: (id: string) => void;
}

export function MemoryGrid({ memories, onDelete }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <AnimatePresence mode="popLayout">
        {memories.map(memory => (
          <MemoryCard key={memory.id} memory={memory} onDelete={onDelete} />
        ))}
      </AnimatePresence>
    </div>
  );
}
