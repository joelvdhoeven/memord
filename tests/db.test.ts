import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { DbClient } from '../src/db/client.js';
import type { Memory } from '../src/types.js';

// Helper: create an in-memory DbClient with the schema applied
function makeClient(): DbClient {
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
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
    CREATE INDEX IF NOT EXISTS idx_memories_ingestion_time ON memories(ingestion_time DESC);
  `);

  return new DbClient(db);
}

// Helper: build a minimal valid Memory object
function makeMemory(overrides: Partial<Memory> = {}): Memory {
  const now = Date.now();
  return {
    id: 'test-id-1',
    type: 'episodic',
    topic: 'general',
    content: 'The user prefers TypeScript over JavaScript.',
    importance: 0.7,
    source: 'manual',
    app: 'test-app',
    user_id: 'user-1',
    event_time: now,
    ingestion_time: now,
    last_accessed: now,
    access_count: 0,
    ...overrides,
  };
}

// Mock embedding: Float32Array of 384 zeros
function zeroEmbedding(): Float32Array {
  return new Float32Array(384);
}

describe('DbClient', () => {
  let client: DbClient;

  beforeEach(() => {
    client = makeClient();
  });

  // ── insert / getById ──────────────────────────────────────────────────────

  describe('insert and getById', () => {
    it('inserts a memory and retrieves it by id', () => {
      const memory = makeMemory();
      client.insert(memory);

      const result = client.getById(memory.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(memory.id);
      expect(result!.content).toBe(memory.content);
      expect(result!.type).toBe(memory.type);
      expect(result!.importance).toBe(memory.importance);
      expect(result!.user_id).toBe(memory.user_id);
    });

    it('returns null for a non-existent id', () => {
      const result = client.getById('does-not-exist');
      expect(result).toBeNull();
    });

    it('stores and retrieves tags correctly', () => {
      const memory = makeMemory({ id: 'tagged-1', tags: ['typescript', 'preferences'] });
      client.insert(memory);

      const result = client.getById(memory.id);
      expect(result!.tags).toEqual(['typescript', 'preferences']);
    });

    it('stores and retrieves metadata correctly', () => {
      const memory = makeMemory({ id: 'meta-1', metadata: { source_url: 'https://example.com', confidence: 0.9 } });
      client.insert(memory);

      const result = client.getById(memory.id);
      expect(result!.metadata).toEqual({ source_url: 'https://example.com', confidence: 0.9 });
    });

    it('replaces an existing memory on id conflict (INSERT OR REPLACE)', () => {
      const original = makeMemory({ content: 'Original content' });
      client.insert(original);

      const replacement = makeMemory({ content: 'Replaced content' });
      client.insert(replacement);

      const result = client.getById(original.id);
      expect(result!.content).toBe('Replaced content');
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates specific fields of a memory', () => {
      const memory = makeMemory();
      client.insert(memory);

      client.update(memory.id, { content: 'Updated content', importance: 0.9 });

      const result = client.getById(memory.id);
      expect(result!.content).toBe('Updated content');
      expect(result!.importance).toBe(0.9);
      // unchanged fields remain intact
      expect(result!.type).toBe(memory.type);
      expect(result!.user_id).toBe(memory.user_id);
    });

    it('update on non-existent id does nothing silently', () => {
      // Should not throw
      expect(() => client.update('ghost-id', { importance: 1.0 })).not.toThrow();
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes an existing memory and returns true', () => {
      const memory = makeMemory();
      client.insert(memory);

      const deleted = client.delete(memory.id);
      expect(deleted).toBe(true);
      expect(client.getById(memory.id)).toBeNull();
    });

    it('returns false when deleting a non-existent id', () => {
      const deleted = client.delete('ghost-id');
      expect(deleted).toBe(false);
    });
  });

  // ── searchFts ─────────────────────────────────────────────────────────────

  describe('searchFts', () => {
    it('finds a memory by a keyword in its content', () => {
      const memory = makeMemory({ id: 'fts-1', content: 'The user strongly prefers dark mode in all editors.' });
      client.insert(memory);

      const results = client.searchFts('dark mode');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].memory.id).toBe('fts-1');
    });

    it('returns empty array when no match', () => {
      client.insert(makeMemory({ id: 'fts-2', content: 'The user prefers light themes.' }));
      const results = client.searchFts('quantum physics');
      expect(results).toHaveLength(0);
    });

    it('filters results by user_id', () => {
      client.insert(makeMemory({ id: 'fts-user-a', user_id: 'user-a', content: 'Loves TypeScript generics deeply.' }));
      client.insert(makeMemory({ id: 'fts-user-b', user_id: 'user-b', content: 'Loves TypeScript generics deeply.' }));

      const results = client.searchFts('TypeScript', { user_id: 'user-a' });
      expect(results.every(r => r.memory.user_id === 'user-a')).toBe(true);
      expect(results.some(r => r.memory.id === 'fts-user-a')).toBe(true);
    });

    it('returns rank field with each result', () => {
      client.insert(makeMemory({ id: 'fts-rank', content: 'Strongly prefers vim keybindings always.' }));
      const results = client.searchFts('vim');
      expect(results[0]).toHaveProperty('rank');
      expect(typeof results[0].rank).toBe('number');
    });

    it('respects the limit option', () => {
      for (let i = 0; i < 5; i++) {
        client.insert(makeMemory({ id: `fts-limit-${i}`, content: `Memory about uniquetoken item number ${i}.` }));
      }
      const results = client.searchFts('uniquetoken', { limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  // ── getAllWithEmbeddings ───────────────────────────────────────────────────

  describe('getAllWithEmbeddings', () => {
    it('returns memories that have embeddings stored', () => {
      const memWithEmb = makeMemory({ id: 'emb-1' });
      const memNoEmb = makeMemory({ id: 'emb-2' });

      client.insert(memWithEmb, zeroEmbedding());
      client.insert(memNoEmb);  // no embedding

      const results = client.getAllWithEmbeddings();
      expect(results).toHaveLength(1);
      expect(results[0].memory.id).toBe('emb-1');
    });

    it('returns a Float32Array of the correct length (384)', () => {
      client.insert(makeMemory({ id: 'emb-dim' }), zeroEmbedding());

      const results = client.getAllWithEmbeddings();
      expect(results[0].embedding).toBeInstanceOf(Float32Array);
      expect(results[0].embedding.length).toBe(384);
    });

    it('filters by user_id when provided', () => {
      client.insert(makeMemory({ id: 'emb-ua', user_id: 'user-a' }), zeroEmbedding());
      client.insert(makeMemory({ id: 'emb-ub', user_id: 'user-b' }), zeroEmbedding());

      const results = client.getAllWithEmbeddings('user-a');
      expect(results).toHaveLength(1);
      expect(results[0].memory.id).toBe('emb-ua');
    });

    it('returns empty array when no embeddings exist', () => {
      client.insert(makeMemory({ id: 'no-emb' }));
      const results = client.getAllWithEmbeddings();
      expect(results).toHaveLength(0);
    });
  });

  // ── getTopCandidates ──────────────────────────────────────────────────────

  describe('getTopCandidates', () => {
    it('returns only memories with embeddings', () => {
      client.insert(makeMemory({ id: 'tc-emb' }), zeroEmbedding());
      client.insert(makeMemory({ id: 'tc-no' }));  // no embedding

      const results = client.getTopCandidates();
      expect(results).toHaveLength(1);
      expect(results[0].memory.id).toBe('tc-emb');
    });

    it('respects the limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        client.insert(makeMemory({ id: `tc-limit-${i}` }), zeroEmbedding());
      }
      const results = client.getTopCandidates(undefined, 3);
      expect(results).toHaveLength(3);
    });

    it('filters by user_id', () => {
      client.insert(makeMemory({ id: 'tc-ua', user_id: 'user-a' }), zeroEmbedding());
      client.insert(makeMemory({ id: 'tc-ub', user_id: 'user-b' }), zeroEmbedding());

      const results = client.getTopCandidates('user-a');
      expect(results).toHaveLength(1);
      expect(results[0].memory.id).toBe('tc-ua');
    });

    it('orders by importance DESC then last_accessed DESC', () => {
      const now = Date.now();
      client.insert(makeMemory({ id: 'tc-lo', importance: 0.3, last_accessed: now }), zeroEmbedding());
      client.insert(makeMemory({ id: 'tc-hi', importance: 0.9, last_accessed: now - 1000 }), zeroEmbedding());

      const results = client.getTopCandidates();
      expect(results[0].memory.id).toBe('tc-hi');
    });

    it('returns Float32Array embeddings of the correct length', () => {
      client.insert(makeMemory({ id: 'tc-dim' }), zeroEmbedding());
      const results = client.getTopCandidates();
      expect(results[0].embedding).toBeInstanceOf(Float32Array);
      expect(results[0].embedding.length).toBe(384);
    });
  });

  // ── countWithEmbeddings ───────────────────────────────────────────────────

  describe('countWithEmbeddings', () => {
    it('returns 0 when no embeddings are stored', () => {
      client.insert(makeMemory({ id: 'cnt-no' }));
      expect(client.countWithEmbeddings()).toBe(0);
    });

    it('counts only rows that have an embedding', () => {
      client.insert(makeMemory({ id: 'cnt-y1' }), zeroEmbedding());
      client.insert(makeMemory({ id: 'cnt-y2' }), zeroEmbedding());
      client.insert(makeMemory({ id: 'cnt-n1' }));
      expect(client.countWithEmbeddings()).toBe(2);
    });

    it('filters by user_id', () => {
      client.insert(makeMemory({ id: 'cnt-ua', user_id: 'user-a' }), zeroEmbedding());
      client.insert(makeMemory({ id: 'cnt-ub', user_id: 'user-b' }), zeroEmbedding());
      expect(client.countWithEmbeddings('user-a')).toBe(1);
    });
  });

  // ── stats ─────────────────────────────────────────────────────────────────

  describe('stats', () => {
    it('returns zero counts on empty db', () => {
      const s = client.stats();
      expect(s.total).toBe(0);
      expect(s.by_type).toEqual({});
      expect(s.oldest).toBe(0);
      expect(s.newest).toBe(0);
    });

    it('returns correct total count', () => {
      client.insert(makeMemory({ id: 'stat-1' }));
      client.insert(makeMemory({ id: 'stat-2' }));
      const s = client.stats();
      expect(s.total).toBe(2);
    });

    it('returns correct by_type breakdown', () => {
      client.insert(makeMemory({ id: 'st-pref-1', type: 'preference' }));
      client.insert(makeMemory({ id: 'st-pref-2', type: 'preference' }));
      client.insert(makeMemory({ id: 'st-goal-1', type: 'goal' }));

      const s = client.stats();
      expect(s.by_type['preference']).toBe(2);
      expect(s.by_type['goal']).toBe(1);
    });

    it('filters stats by user_id', () => {
      const now = Date.now();
      client.insert(makeMemory({ id: 'st-u1-a', user_id: 'user-1', type: 'preference', ingestion_time: now }));
      client.insert(makeMemory({ id: 'st-u1-b', user_id: 'user-1', type: 'goal', ingestion_time: now }));
      client.insert(makeMemory({ id: 'st-u2-a', user_id: 'user-2', type: 'preference', ingestion_time: now }));

      const s = client.stats('user-1');
      expect(s.total).toBe(2);
    });

    it('returns correct oldest and newest ingestion times', () => {
      const t1 = 1_700_000_000_000;
      const t2 = 1_700_000_001_000;

      client.insert(makeMemory({ id: 'ts-old', ingestion_time: t1 }));
      client.insert(makeMemory({ id: 'ts-new', ingestion_time: t2 }));

      const s = client.stats();
      expect(s.oldest).toBe(t1);
      expect(s.newest).toBe(t2);
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('lists memories ordered by ingestion_time descending', () => {
      const now = Date.now();
      client.insert(makeMemory({ id: 'list-old', ingestion_time: now - 2000 }));
      client.insert(makeMemory({ id: 'list-new', ingestion_time: now - 100 }));

      const results = client.list({ user_id: 'user-1' });
      expect(results[0].id).toBe('list-new');
      expect(results[1].id).toBe('list-old');
    });

    it('filters by user_id', () => {
      client.insert(makeMemory({ id: 'list-u1', user_id: 'user-1' }));
      client.insert(makeMemory({ id: 'list-u2', user_id: 'user-2' }));

      const results = client.list({ user_id: 'user-1' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('list-u1');
    });
  });

  // ── touchAccessed ─────────────────────────────────────────────────────────

  describe('touchAccessed', () => {
    it('increments access_count and updates last_accessed', () => {
      const memory = makeMemory({ access_count: 0, last_accessed: 1_000 });
      client.insert(memory);

      client.touchAccessed(memory.id);
      const result = client.getById(memory.id);

      expect(result!.access_count).toBe(1);
      expect(result!.last_accessed).toBeGreaterThan(1_000);
    });
  });
});
