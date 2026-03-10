#!/usr/bin/env node
import { join } from 'path';
import { homedir } from 'os';
import { createDb, DbClient } from './db/client.js';
import { MemoryManager } from './memory/manager.js';
import { startMcpStdio } from './mcp/server.js';
import { startHttpServer } from './http/server.js';
import { loadEmbedder } from './embeddings/index.js';
import { scheduleMaintenance } from './db/maintenance.js';

const DB_PATH = join(homedir(), '.memord', 'memories.db');
const HTTP_PORT = parseInt(process.env.MEMORD_PORT ?? '7432');
const MODE = process.argv[2] ?? 'mcp';  // 'mcp' | 'http' | 'both' | 'setup'

async function main() {
  if (MODE === 'setup') {
    const { runSetup } = await import('./setup.js');
    runSetup();
    return;
  }
  console.error(`[memord] Starting (mode: ${MODE})`);
  console.error(`[memord] Database: ${DB_PATH}`);

  const db = createDb(DB_PATH);

  const stopMaintenance = scheduleMaintenance(db);
  process.on('SIGINT', () => {
    stopMaintenance();
    process.exit(0);
  });

  const client = new DbClient(db);
  const manager = new MemoryManager(client, {
    db_path: DB_PATH,
    user_id: process.env.MEMORD_USER ?? 'default',
    http_port: HTTP_PORT,
    importance_threshold: parseFloat(process.env.MEMORD_IMPORTANCE_THRESHOLD ?? '0.3'),
    similarity_threshold: parseFloat(process.env.MEMORD_SIMILARITY_THRESHOLD ?? '0.08'),
  });

  if (MODE === 'http' || MODE === 'both') {
    // Pre-load embeddings for HTTP mode (user-facing, can show loading state)
    await loadEmbedder();
    startHttpServer(manager, HTTP_PORT, db);
  }

  if (MODE === 'mcp' || MODE === 'both') {
    // Start MCP immediately — embeddings load lazily on first use
    // This prevents Claude Desktop from timing out during handshake
    loadEmbedder().catch(err => console.error('[memord] Embedder preload failed:', err));
    await startMcpStdio(manager);
  }

  if (MODE === 'http') {
    // Keep process alive for HTTP-only mode
    await new Promise(() => {});
  }
}

main().catch(err => {
  console.error('[memord] Fatal error:', err);
  process.exit(1);
});
