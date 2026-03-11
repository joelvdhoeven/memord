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

const HELP = `
memord — local shared memory for your AI tools

Usage:
  npx memord setup     Configure your AI tools (run this first)
  npx memord mcp       Start MCP stdio server (default — used by Claude, Cursor, etc.)
  npx memord http      Start HTTP API + dashboard at http://localhost:7432
  npx memord both      Start both MCP and HTTP

Options:
  --help, -h           Show this help message
  --version, -v        Show version

Environment:
  MEMORD_PORT          HTTP port (default: 7432)
  MEMORD_USER          User ID for multi-user setups (default: "default")

Docs: https://github.com/joelvdhoeven/memord
`;

async function main() {
  if (MODE === '--help' || MODE === '-h' || MODE === 'help') {
    console.log(HELP);
    process.exit(0);
  }

  if (MODE === '--version' || MODE === '-v') {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json');
    console.log(pkg.version);
    process.exit(0);
  }

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
