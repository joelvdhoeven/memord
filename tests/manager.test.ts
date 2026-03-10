import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { DbClient } from '../src/db/client.js';
import { MemoryManager } from '../src/memory/manager.js';
import type { MemordConfig } from '../src/types.js';

// ── Mock the embed function ───────────────────────────────────────────────────
//
// We use a deterministic stub: each unique string gets a unique unit vector in
// 384-dimensional space.  Two calls with the same string return the same vector;
// calls with "similar" strings (shared key) return near-identical vectors so we
// can test the deduplication path.

vi.mock('../src/embeddings/index.js', () => {
  // Simple seeded embedding: hash the string to a seed, sprinkle it into one slot
  function deterministicEmbed(text: string): Float32Array {
    const v = new Float32Array(384);
    // Hash the text to an index
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    const idx = hash % 384;
    v[idx] = 1.0;   // unit vector — unique per text
    return v;
  }

  return {
    embed: vi.fn(async (text: string) => deterministicEmbed(text)),
    embedBatch: vi.fn(async (texts: string[]) => texts.map(deterministicEmbed)),
    loadEmbedder: vi.fn(async () => {}),
    EMBEDDING_DIM: 384,
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInMemorySchema(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('preference','project_fact','constraint','goal','episodic','skill')),
      topic TEXT NOT NULL DEFAULT 'general',
      content TEXT NOT NULL,
      importance REAL NOT NULL DEFAULT 0.5,
      source TEXT NOT NULL DEFAULT 'manual',
      app TEXT NOT NULL DEFAULT 'unknown',
      user_id TEXT NOT NULL DEFAULT 'default',
      event_time INTEGER NOT NULL,
      ingestion_time INTEGER NOT NULL,
      last_accessed INTEGER NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 0,
      tags TEXT,
      metadata TEXT,
      embedding BLOB
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      topic,
      tags,
      content='memories',
      content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS memories_fts_insert AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, topic, tags)
      VALUES (new.rowid, new.content, new.topic, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_fts_delete AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, topic, tags)
      VALUES ('delete', old.rowid, old.content, old.topic, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_fts_update AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, topic, tags)
      VALUES ('delete', old.rowid, old.content, old.topic, old.tags);
      INSERT INTO memories_fts(rowid, content, topic, tags)
      VALUES (new.rowid, new.content, new.topic, new.tags);
    END;

    CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
    CREATE INDEX IF NOT EXISTS idx_memories_ingestion_time ON memories(ingestion_time DESC);
  `);
  return db;
}

function makeManager(configOverrides: Partial<MemordConfig> = {}): { manager: MemoryManager; dbClient: DbClient } {
  const raw = makeInMemorySchema();
  const dbClient = new DbClient(raw);
  const manager = new MemoryManager(dbClient, {
    importance_threshold: 0.3,
    similarity_threshold: 0.08,
    ...configOverrides,
  });
  return { manager, dbClient };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MemoryManager', () => {
  // ── remember ───────────────────────────────────────────────────────────────

  describe('remember()', () => {
    it('adds a new memory and returns action="added"', async () => {
      const { manager, dbClient } = makeManager();

      const result = await manager.remember({
        content: 'The user prefers TypeScript for all new projects.',
        type: 'preference',
        importance: 0.8,
        user_id: 'default',
      });

      expect(result.action).toBe('added');
      expect(result.memory.content).toBe('The user prefers TypeScript for all new projects.');
      expect(result.memory.type).toBe('preference');

      // Verify it actually landed in the DB
      const fromDb = dbClient.getById(result.memory.id);
      expect(fromDb).not.toBeNull();
      expect(fromDb!.content).toBe('The user prefers TypeScript for all new projects.');
    });

    it('returns action="skipped" when importance is below threshold (< 0.3)', async () => {
      const { manager, dbClient } = makeManager();

      const result = await manager.remember({
        content: 'The user said something vague and unimportant.',
        importance: 0.1,
        user_id: 'default',
      });

      expect(result.action).toBe('skipped');

      // Nothing should be stored
      const all = dbClient.list({ user_id: 'default' });
      expect(all).toHaveLength(0);
    });

    it('returns action="skipped" for importance exactly at 0 (well below threshold)', async () => {
      const { manager } = makeManager();
      const result = await manager.remember({ content: 'Low signal noise.', importance: 0.0 });
      expect(result.action).toBe('skipped');
    });

    it('stores memories at exactly the importance threshold (>= 0.3)', async () => {
      const { manager } = makeManager();
      const result = await manager.remember({
        content: 'The user works on a web application using React and Node.',
        importance: 0.3,
        user_id: 'default',
      });
      // 0.3 is NOT less-than 0.3, so it should pass the gate
      expect(result.action).toBe('added');
    });

    it('deduplicates: storing identical content updates instead of adding', async () => {
      const { manager, dbClient } = makeManager({ similarity_threshold: 0.99 });
      // With a very high similarity threshold, even vectors that differ slightly are treated as duplicates.
      // Our deterministic embed returns the exact same vector for the same string.

      const content = 'The user always uses dark mode in their editor.';

      const first = await manager.remember({ content, importance: 0.7, user_id: 'default' });
      expect(first.action).toBe('added');

      // Insert the exact same content — cosine distance will be 0 (< 0.99)
      const second = await manager.remember({ content, importance: 0.7, user_id: 'default' });
      expect(second.action).toBe('updated');

      // Only one record should exist
      const all = dbClient.list({ user_id: 'default' });
      expect(all).toHaveLength(1);
    });

    it('adds a second memory when content is sufficiently different', async () => {
      const { manager, dbClient } = makeManager();

      await manager.remember({
        content: 'The user prefers vim keybindings in VS Code.',
        importance: 0.7,
        user_id: 'default',
      });
      await manager.remember({
        content: 'The project backend is built on Hono and deployed to Fly.io.',
        importance: 0.7,
        user_id: 'default',
      });

      const all = dbClient.list({ user_id: 'default' });
      expect(all).toHaveLength(2);
    });

    it('infers topic from content when none is provided', async () => {
      const { manager } = makeManager();
      const result = await manager.remember({
        content: 'We decided to use TypeScript for the whole monorepo.',
        importance: 0.7,
        user_id: 'default',
      });
      expect(result.memory.topic).toBe('tech_stack');
    });

    it('respects an explicit topic override', async () => {
      const { manager } = makeManager();
      const result = await manager.remember({
        content: 'The team ships on Fridays.',
        topic: 'my_custom_topic',
        importance: 0.6,
        user_id: 'default',
      });
      expect(result.memory.topic).toBe('my_custom_topic');
    });
  });

  // ── recall ─────────────────────────────────────────────────────────────────

  describe('recall()', () => {
    it('returns relevant memories after storing some', async () => {
      const { manager } = makeManager();

      await manager.remember({
        content: 'The user strongly prefers TypeScript over plain JavaScript.',
        type: 'preference',
        importance: 0.8,
        user_id: 'default',
      });

      const results = await manager.recall({ query: 'TypeScript preference', user_id: 'default' });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].memory.content).toContain('TypeScript');
    });

    it('returns an empty array when no memories exist', async () => {
      const { manager } = makeManager();
      const results = await manager.recall({ query: 'anything', user_id: 'default' });
      expect(results).toHaveLength(0);
    });

    it('each result has a memory and a numeric score', async () => {
      const { manager } = makeManager();

      await manager.remember({
        content: 'The user enjoys functional programming patterns in TypeScript.',
        importance: 0.7,
        user_id: 'default',
      });

      const results = await manager.recall({ query: 'functional programming', user_id: 'default' });
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r).toHaveProperty('memory');
        expect(r).toHaveProperty('score');
        expect(typeof r.score).toBe('number');
      }
    });

    it('respects the limit option', async () => {
      const { manager } = makeManager();

      for (let i = 0; i < 5; i++) {
        await manager.remember({
          content: `Memory entry number ${i}: the user finds this topic useful and worth keeping.`,
          importance: 0.6,
          user_id: 'default',
        });
      }

      const results = await manager.recall({ query: 'user memory topic', user_id: 'default', limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('filters by memory type', async () => {
      const { manager } = makeManager();

      await manager.remember({ content: 'I prefer TypeScript always for type safety.', type: 'preference', importance: 0.7, user_id: 'default' });
      await manager.remember({ content: 'The project goal is to ship a working demo by end of sprint.', type: 'goal', importance: 0.8, user_id: 'default' });

      const results = await manager.recall({ query: 'TypeScript project', user_id: 'default', types: ['preference'] });
      expect(results.every(r => r.memory.type === 'preference')).toBe(true);
    });
  });

  // ── forget ─────────────────────────────────────────────────────────────────

  describe('forget()', () => {
    it('removes a memory and returns true', async () => {
      const { manager, dbClient } = makeManager();

      const result = await manager.remember({
        content: 'The user wants to remove this memory eventually.',
        importance: 0.5,
        user_id: 'default',
      });

      const deleted = manager.forget(result.memory.id);
      expect(deleted).toBe(true);

      const fromDb = dbClient.getById(result.memory.id);
      expect(fromDb).toBeNull();
    });

    it('returns false when forgetting a non-existent id', () => {
      const { manager } = makeManager();
      const deleted = manager.forget('ghost-uuid');
      expect(deleted).toBe(false);
    });

    it('does not affect other memories when one is deleted', async () => {
      const { manager, dbClient } = makeManager();

      const a = await manager.remember({ content: 'Memory A, unique fact about project alpha.', importance: 0.6, user_id: 'default' });
      const b = await manager.remember({ content: 'Memory B, another separate distinct fact about project beta.', importance: 0.6, user_id: 'default' });

      manager.forget(a.memory.id);

      const all = dbClient.list({ user_id: 'default' });
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(b.memory.id);
    });
  });

  // ── listRecent ─────────────────────────────────────────────────────────────

  describe('listRecent()', () => {
    it('returns memories in descending ingestion_time order', async () => {
      const { manager } = makeManager();

      await manager.remember({ content: 'First memory entry stored in the database.', importance: 0.5, user_id: 'default' });
      // Small delay so ingestion_time differs
      await new Promise(r => setTimeout(r, 5));
      await manager.remember({ content: 'Second memory entry stored right after the first one.', importance: 0.5, user_id: 'default' });

      const recent = manager.listRecent({ user_id: 'default', limit: 10 });

      expect(recent.length).toBe(2);
      // Most recent first
      expect(recent[0].ingestion_time).toBeGreaterThanOrEqual(recent[1].ingestion_time);
    });

    it('respects the limit option', async () => {
      const { manager } = makeManager();

      for (let i = 0; i < 5; i++) {
        await manager.remember({
          content: `Distinct memory entry number ${i} about a separate unique topic worth remembering.`,
          importance: 0.5,
          user_id: 'default',
        });
      }

      const recent = manager.listRecent({ user_id: 'default', limit: 3 });
      expect(recent.length).toBeLessThanOrEqual(3);
    });

    it('returns an empty array when no memories exist', () => {
      const { manager } = makeManager();
      const recent = manager.listRecent({ user_id: 'default' });
      expect(recent).toHaveLength(0);
    });
  });

  // ── stats ──────────────────────────────────────────────────────────────────

  describe('stats()', () => {
    it('delegates to DbClient and returns correct counts', async () => {
      const { manager } = makeManager();

      await manager.remember({ content: 'I prefer TypeScript for everything including scripts.', type: 'preference', importance: 0.7, user_id: 'default' });
      await manager.remember({ content: 'We cannot use external paid APIs in this project at all.', type: 'constraint', importance: 0.85, user_id: 'default' });

      const s = manager.stats('default');
      expect(s.total).toBe(2);
      expect(s.by_type['preference']).toBe(1);
      expect(s.by_type['constraint']).toBe(1);
    });
  });
});
