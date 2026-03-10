import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../dist/public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/memories': 'http://localhost:7432',
      '/stats': 'http://localhost:7432',
      '/ollama': 'http://localhost:7432',
      '/extract': 'http://localhost:7432',
      '/health': 'http://localhost:7432',
      '/maintenance': 'http://localhost:7432',
    },
  },
});
