import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type Database from 'better-sqlite3';
import type { MemoryManager } from '../memory/manager.js';
import type { MemoryType, MemorySource } from '../types.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export function createHttpServer(manager: MemoryManager, db?: Database.Database) {
  const app = new Hono();

  // CORS for localhost dashboard
  app.use('*', async (c, next) => {
    await next();
    c.res.headers.set('Access-Control-Allow-Origin', '*');
    c.res.headers.set('Access-Control-Allow-Methods', 'GET,POST,DELETE,PATCH,OPTIONS');
    c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  });
  app.options('*', (c) => new Response(null, { status: 204 }));

  // Resolve the public directory relative to this compiled file (dist/http/server.js -> dist/public)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const publicDir = join(__dirname, '..', 'public');

  // Serve static assets (JS, CSS bundles from Vite)
  app.get('/assets/*', async (c) => {
    const filePath = join(publicDir, c.req.path);
    if (!existsSync(filePath)) return c.notFound();
    const content = await readFile(filePath);
    const ext = (filePath.split('.').pop() ?? '').toLowerCase();
    const mimeTypes: Record<string, string> = {
      'js': 'application/javascript',
      'css': 'text/css',
      'svg': 'image/svg+xml',
      'png': 'image/png',
      'ico': 'image/x-icon',
      'woff': 'font/woff',
      'woff2': 'font/woff2',
    };
    return new Response(content, {
      headers: { 'Content-Type': mimeTypes[ext] ?? 'application/octet-stream' },
    });
  });

  // Dashboard (serve index.html or fallback message)
  app.get('/', async (c) => {
    const indexPath = join(publicDir, 'index.html');
    if (!existsSync(indexPath)) {
      return c.html('<h1>memord</h1><p>Dashboard not built. Run: npm run build:dashboard</p>');
    }
    const html = await readFile(indexPath, 'utf8');
    return c.html(html);
  });

  // Health
  app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }));

  // Stats
  app.get('/stats', (c) => {
    const user_id = c.req.query('user_id');
    return c.json(manager.stats(user_id));
  });

  // Remember
  app.post('/memories', async (c) => {
    const body = await c.req.json();
    const result = await manager.remember({
      ...body,
      type: body.type as MemoryType | undefined,
      source: body.source as MemorySource | undefined,
    });
    return c.json(result, result.action === 'added' ? 201 : 200);
  });

  // Bulk extract from text using Ollama if available, regex fallback
  app.post('/extract', async (c) => {
    const body = await c.req.json();
    const { text, app } = body as { text?: string; app?: string };
    if (!text || typeof text !== 'string') {
      return c.json({ error: 'text required' }, 400);
    }
    const result = await manager.extractAndRemember(text, { app });
    return c.json(result);
  });

  // Ollama availability check
  app.get('/ollama/status', async (c) => {
    const { checkOllama } = await import('../extractor/ollama.js');
    const status = await checkOllama();
    return c.json(status);
  });

  // Recall
  app.get('/memories/search', async (c) => {
    const query = c.req.query('q') ?? '';
    const user_id = c.req.query('user_id');
    const limit = parseInt(c.req.query('limit') ?? '10');
    const since = c.req.query('since') ? new Date(c.req.query('since')!).getTime() : undefined;
    const results = await manager.recall({ query, user_id, limit, since });
    return c.json({ count: results.length, results });
  });

  // List recent
  app.get('/memories', (c) => {
    const user_id = c.req.query('user_id');
    const limit = parseInt(c.req.query('limit') ?? '50');
    const since_hours = c.req.query('since_hours') ? parseFloat(c.req.query('since_hours')!) : undefined;
    const memories = manager.listRecent({ user_id, limit, since_hours });
    return c.json({ count: memories.length, memories });
  });

  // Get by ID
  app.get('/memories/:id', (c) => {
    const memory = manager['db'].getById(c.req.param('id'));
    if (!memory) return c.json({ error: 'Not found' }, 404);
    return c.json(memory);
  });

  // Forget
  app.delete('/memories/:id', (c) => {
    const deleted = manager.forget(c.req.param('id'));
    return c.json({ deleted });
  });

  // Reflect
  app.get('/reflect', async (c) => {
    const topic = c.req.query('topic') ?? '';
    const user_id = c.req.query('user_id');
    const result = await manager.reflect(topic, user_id);
    return c.json(result);
  });

  // Maintenance — trigger an immediate cleanup run
  app.post('/maintenance', async (c) => {
    if (!db) {
      return c.json({ error: 'db not available' }, 503);
    }
    const { MaintenanceRunner } = await import('../db/maintenance.js');
    const body = await c.req.json().catch(() => ({})) as { user_id?: string };
    const runner = new MaintenanceRunner(db);
    const result = runner.run(body.user_id);
    return c.json(result);
  });

  return app;
}

export function startHttpServer(manager: MemoryManager, port: number, db?: Database.Database): void {
  const app = createHttpServer(manager, db);
  serve({ fetch: app.fetch, port }, () => {
    console.error(`[memord] HTTP API running on http://localhost:${port}`);
    console.error(`[memord] Dashboard:  http://localhost:${port}/`);
  });
}
