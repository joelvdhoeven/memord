import { RefreshCw, Plus, X, Brain } from 'lucide-react';
import type { OllamaStatus } from '../api';

interface Props {
  ollamaStatus: OllamaStatus | null;
  onRefresh: () => void;
  onAdd: () => void;
  showAddForm: boolean;
}

export function Header({ ollamaStatus, onRefresh, onAdd, showAddForm }: Props) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700/50 flex items-center px-4 sm:px-6">
      {/* Logo */}
      <div className="flex items-center gap-3 mr-auto">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <Brain className="w-4 h-4 text-white" />
        </div>
        <span className="text-lg font-bold text-gray-100 tracking-tight">memord</span>
        <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-gray-800 text-gray-400 border border-gray-700">v0.1.0</span>
      </div>

      {/* Ollama status */}
      <div className="hidden sm:flex items-center gap-2 mr-4 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700">
        <div className={`w-2 h-2 rounded-full ${
          ollamaStatus === null ? 'bg-gray-500' :
          ollamaStatus.available ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' :
          'bg-red-400'
        }`} />
        <span className="text-xs text-gray-400">
          {ollamaStatus === null ? 'Checking...' :
           ollamaStatus.available ? `Ollama · ${ollamaStatus.model}` :
           'Ollama offline'}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          className="h-9 w-9 rounded-xl flex items-center justify-center border border-gray-700 hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          onClick={onAdd}
          className={`h-9 px-4 rounded-xl flex items-center gap-2 font-medium text-sm transition-all ${
            showAddForm
              ? 'bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 hover:-translate-y-0.5'
          }`}
        >
          {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          <span className="hidden sm:inline">{showAddForm ? 'Cancel' : 'Add Memory'}</span>
        </button>
      </div>
    </header>
  );
}
