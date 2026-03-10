#!/usr/bin/env node
import { join } from 'path';
import { homedir } from 'os';
import { createDb, DbClient } from './db/client.js';
import { MemoryManager } from './memory/manager.js';
import { startMcpStdio } from './mcp/server.js';
import { startHttpServer } from './http/server.js';
import { loadEmbedder } from './embeddings/index.js';

const DB_PATH = join(homedir(), '.memord', 'memories.db');
const HTTP_PORT = parseInt(process.env.MEMORD_PORT ?? '7432');
const MODE = process.argv[2] ?? 'mcp';  // 'mcp' | 'http' | 'both'

async function main() {
  console.error(`[memord] Starting (mode: ${MODE})`);
  console.error(`[memord] Database: ${DB_PATH}`);

  const db = createDb(DB_PATH);
  const client = new DbClient(db);
  const manager = new MemoryManager(client, {
    db_path: DB_PATH,
    user_id: process.env.MEMORD_USER ?? 'default',
    http_port: HTTP_PORT,
    importance_threshold: parseFloat(process.env.MEMORD_IMPORTANCE_THRESHOLD ?? '0.3'),
    similarity_threshold: parseFloat(process.env.MEMORD_SIMILARITY_THRESHOLD ?? '0.08'),
  });

  // Pre-load embedding model
  await loadEmbedder();

  if (MODE === 'http' || MODE === 'both') {
    startHttpServer(manager, HTTP_PORT);
  }

  if (MODE === 'mcp' || MODE === 'both') {
    await startMcpStdio(manager);
  }

  if (MODE === 'http') {
    // Keep process alive for HTTP-only mode
    process.on('SIGINT', () => { console.error('[memord] Shutting down'); process.exit(0); });
    await new Promise(() => {});
  }
}

main().catch(err => {
  console.error('[memord] Fatal error:', err);
  process.exit(1);
});
