import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { MemoryManager } from '../memory/manager.js';
import type { MemoryType, MemorySource } from '../types.js';
import { dashboardHtml } from './dashboard.js';
import { extractFromText } from '../extractor/index.js';

export function createHttpServer(manager: MemoryManager) {
  const app = new Hono();

  // CORS for localhost dashboard
  app.use('*', async (c, next) => {
    await next();
    c.res.headers.set('Access-Control-Allow-Origin', '*');
    c.res.headers.set('Access-Control-Allow-Methods', 'GET,POST,DELETE,PATCH,OPTIONS');
    c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  });
  app.options('*', (c) => new Response(null, { status: 204 }));

  // Dashboard
  app.get('/', (c) => c.html(dashboardHtml));

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

  // Bulk extract from text (used by Claude Code hooks)
  app.post('/extract', async (c) => {
    const body = await c.req.json() as { text: string; source?: MemorySource; app?: string; user_id?: string };
    const candidates = extractFromText(body.text, {
      source: body.source,
      app: body.app,
      user_id: body.user_id,
    });
    const results = await Promise.all(candidates.map(m => manager.remember(m)));
    const added = results.filter(r => r.action === 'added').length;
    const updated = results.filter(r => r.action === 'updated').length;
    const skipped = results.filter(r => r.action === 'skipped').length;
    return c.json({ extracted: candidates.length, added, updated, skipped });
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

  return app;
}

export function startHttpServer(manager: MemoryManager, port: number): void {
  const app = createHttpServer(manager);
  serve({ fetch: app.fetch, port }, () => {
    console.error(`[memord] HTTP API running on http://localhost:${port}`);
    console.error(`[memord] Dashboard:  http://localhost:${port}/`);
  });
}
