import { motion } from 'framer-motion';

export function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-8 h-8 border-2 border-gray-700 border-t-indigo-500 rounded-full"
      />
      <p className="text-sm text-gray-500">Loading memories...</p>
    </div>
  );
}
