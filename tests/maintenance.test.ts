import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MaintenanceRunner } from '../src/db/maintenance.js';
import type { Memory } from '../src/types.js';

// ── Schema helper ─────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
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
  CREATE INDEX IF NOT EXISTS idx_memories_last_accessed ON memories(last_accessed DESC);
`;

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  return db;
}

// ── Memory insertion helper ───────────────────────────────────────────────────

let _idCounter = 0;

function insertMemory(db: Database.Database, overrides: Partial<Memory> = {}): Memory {
  const now = Date.now();
  const memory: Memory = {
    id: `mem-${++_idCounter}`,
    type: 'episodic',
    topic: 'general',
    content: 'Test memory content',
    importance: 0.5,
    source: 'manual',
    app: 'test',
    user_id: 'default',
    event_time: now,
    ingestion_time: now,
    last_accessed: now,
    access_count: 0,
    ...overrides,
  };

  db.prepare(`
    INSERT INTO memories
      (id, type, topic, content, importance, source, app, user_id,
       event_time, ingestion_time, last_accessed, access_count, tags, metadata)
    VALUES
      (@id, @type, @topic, @content, @importance, @source, @app, @user_id,
       @event_time, @ingestion_time, @last_accessed, @access_count, @tags, @metadata)
  `).run({
    ...memory,
    tags: memory.tags ? JSON.stringify(memory.tags) : null,
    metadata: memory.metadata ? JSON.stringify(memory.metadata) : null,
  });

  return memory;
}

function count(db: Database.Database, user_id?: string): number {
  if (user_id) {
    return (db.prepare('SELECT COUNT(*) as c FROM memories WHERE user_id = ?').get(user_id) as { c: number }).c;
  }
  return (db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c;
}

// Timestamps
const DAY_MS = 86_400_000;
const now = Date.now();
const daysAgo = (d: number) => now - d * DAY_MS;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MaintenanceRunner', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    _idCounter = 0;
  });

  // ── Episodic TTL pruning ────────────────────────────────────────────────────

  describe('episodic TTL pruning', () => {
    it('prunes episodic memories older than TTL with low importance', () => {
      // Old episodic, low importance — should be pruned
      insertMemory(db, {
        type: 'episodic',
        importance: 0.2,
        ingestion_time: daysAgo(100), // older than 90-day TTL
      });

      const runner = new MaintenanceRunner(db, { vacuum_after_prune: false });
      const result = runner.run();

      expect(result.pruned).toBe(1);
      expect(count(db)).toBe(0);
    });

    it('does NOT prune recent episodic memories (within TTL)', () => {
      // Recent episodic, low importance — within TTL, keep it
      insertMemory(db, {
        type: 'episodic',
        importance: 0.2,
        ingestion_time: daysAgo(10), // well within 90-day TTL
      });

      const runner = new MaintenanceRunner(db, { vacuum_after_prune: false });
      const result = runner.run();

      expect(result.pruned).toBe(0);
      expect(count(db)).toBe(1);
    });

    it('does NOT prune old episodic memories with high importance (>= threshold)', () => {
      // Old episodic, but importance is at/above the prune threshold
      insertMemory(db, {
        type: 'episodic',
        importance: 0.4, // exactly at threshold — should NOT be pruned
        ingestion_time: daysAgo(100),
      });
      insertMemory(db, {
        type: 'episodic',
        importance: 0.8, // well above threshold
        ingestion_time: daysAgo(200),
      });

      const runner = new MaintenanceRunner(db, { vacuum_after_prune: false });
      const result = runner.run();

      expect(result.pruned).toBe(0);
      expect(count(db)).toBe(2);
    });

    it('prunes only below-threshold episodic when mixed importance exists', () => {
      // This one should be pruned
      insertMemory(db, {
        type: 'episodic',
        importance: 0.1,
        ingestion_time: daysAgo(100),
      });
      // This one should survive (high importance)
      insertMemory(db, {
        type: 'episodic',
        importance: 0.9,
        ingestion_time: daysAgo(100),
      });

      const runner = new MaintenanceRunner(db, { vacuum_after_prune: false });
      const result = runner.run();

      expect(result.pruned).toBe(1);
      expect(count(db)).toBe(1);
    });
  });

  // ── Stale any-type pruning ──────────────────────────────────────────────────

  describe('stale any-type pruning', () => {
    it('prunes non-episodic memories older than stale TTL with very low importance', () => {
      // Preference type, very old, very low importance
      insertMemory(db, {
        type: 'preference',
        importance: 0.2,
        ingestion_time: daysAgo(400), // older than 365-day stale TTL
      });

      const runner = new MaintenanceRunner(db, { vacuum_after_prune: false });
      const result = runner.run();

      expect(result.pruned).toBe(1);
      expect(count(db)).toBe(0);
    });

    it('does NOT prune memories younger than stale TTL even with low importance', () => {
      insertMemory(db, {
        type: 'preference',
        importance: 0.1,
        ingestion_time: daysAgo(200), // within 365-day TTL
      });

      const runner = new MaintenanceRunner(db, { vacuum_after_prune: false });
      const result = runner.run();

      expect(result.pruned).toBe(0);
      expect(count(db)).toBe(1);
    });

    it('does NOT prune stale memories with importance at/above stale threshold', () => {
      insertMemory(db, {
        type: 'goal',
        importance: 0.3, // exactly at stale_prune_importance — keep
        ingestion_time: daysAgo(400),
      });
      insertMemory(db, {
        type: 'skill',
        importance: 0.8,
        ingestion_time: daysAgo(500),
      });

      const runner = new MaintenanceRunner(db, { vacuum_after_prune: false });
      const result = runner.run();

      expect(result.pruned).toBe(0);
      expect(count(db)).toBe(2);
    });

    it('prunes all memory types that are stale and low-importance', () => {
      const types = ['preference', 'project_fact', 'constraint', 'goal', 'episodic', 'skill'] as const;
      for (const type of types) {
        insertMemory(db, {
          type,
          importance: 0.1,
          ingestion_time: daysAgo(400),
        });
      }

      const runner = new MaintenanceRunner(db, { vacuum_after_prune: false });
      const result = runner.run();

      // All 6 should be pruned (episodic by step 1, rest by step 2)
      expect(result.pruned).toBe(6);
      expect(count(db)).toBe(0);
    });
  });

  // ── Per-user cap ───────────────────────────────────────────────────────────

  describe('per-user memory cap', () => {
    it('prunes excess memories starting with lowest importance when cap is exceeded', () => {
      // Insert 5 memories with varying importance; cap at 3
      insertMemory(db, { importance: 0.9, last_accessed: now });
      insertMemory(db, { importance: 0.8, last_accessed: now });
      insertMemory(db, { importance: 0.7, last_accessed: now });
      insertMemory(db, { importance: 0.2, last_accessed: now - 1000 }); // lowest importance — first to go
      insertMemory(db, { importance: 0.1, last_accessed: now - 2000 }); // lowest importance — second to go

      const runner = new MaintenanceRunner(db, {
        max_memories_per_user: 3,
        vacuum_after_prune: false,
      });
      const result = runner.run();

      expect(result.pruned).toBe(2);
      expect(count(db)).toBe(3);
    });

    it('does not prune when count is exactly at the cap', () => {
      insertMemory(db, { importance: 0.5 });
      insertMemory(db, { importance: 0.6 });
      insertMemory(db, { importance: 0.7 });

      const runner = new MaintenanceRunner(db, {
        max_memories_per_user: 3,
        vacuum_after_prune: false,
      });
      const result = runner.run();

      expect(result.pruned).toBe(0);
      expect(count(db)).toBe(3);
    });

    it('caps independently per user', () => {
      // user-a: 3 memories, cap 2 → prune 1 (lowest importance)
      insertMemory(db, { user_id: 'user-a', importance: 0.9 });
      insertMemory(db, { user_id: 'user-a', importance: 0.8 });
      insertMemory(db, { user_id: 'user-a', importance: 0.1 }); // pruned

      // user-b: 2 memories, cap 2 → prune 0
      insertMemory(db, { user_id: 'user-b', importance: 0.5 });
      insertMemory(db, { user_id: 'user-b', importance: 0.6 });

      const runner = new MaintenanceRunner(db, {
        max_memories_per_user: 2,
        vacuum_after_prune: false,
      });
      const result = runner.run();

      expect(result.pruned).toBe(1);
      expect(count(db, 'user-a')).toBe(2);
      expect(count(db, 'user-b')).toBe(2);
    });
  });

  // ── VACUUM behavior ────────────────────────────────────────────────────────

  describe('VACUUM behavior', () => {
    it('sets vacuumed=true when memories are pruned and vacuum_after_prune=true', () => {
      insertMemory(db, {
        type: 'episodic',
        importance: 0.1,
        ingestion_time: daysAgo(100),
      });

      const runner = new MaintenanceRunner(db, { vacuum_after_prune: true });
      const result = runner.run();

      expect(result.pruned).toBeGreaterThan(0);
      expect(result.vacuumed).toBe(true);
    });

    it('sets vacuumed=false when vacuum_after_prune=false even if memories are pruned', () => {
      insertMemory(db, {
        type: 'episodic',
        importance: 0.1,
        ingestion_time: daysAgo(100),
      });

      const runner = new MaintenanceRunner(db, { vacuum_after_prune: false });
      const result = runner.run();

      expect(result.pruned).toBeGreaterThan(0);
      expect(result.vacuumed).toBe(false);
    });

    it('does not VACUUM when nothing is pruned', () => {
      // Clean DB — nothing to prune
      insertMemory(db, { importance: 0.9, ingestion_time: now });

      const runner = new MaintenanceRunner(db, { vacuum_after_prune: true });
      const result = runner.run();

      expect(result.pruned).toBe(0);
      expect(result.vacuumed).toBe(false);
    });
  });

  // ── Clean DB ───────────────────────────────────────────────────────────────

  describe('clean database', () => {
    it('returns pruned=0 and vacuumed=false on an empty database', () => {
      const runner = new MaintenanceRunner(db, { vacuum_after_prune: true });
      const result = runner.run();

      expect(result.pruned).toBe(0);
      expect(result.vacuumed).toBe(false);
      expect(result.total_before).toBe(0);
      expect(result.total_after).toBe(0);
    });

    it('returns pruned=0 when all memories are recent and high-importance', () => {
      insertMemory(db, { importance: 0.9, ingestion_time: daysAgo(1) });
      insertMemory(db, { importance: 0.8, ingestion_time: daysAgo(5) });

      const runner = new MaintenanceRunner(db, { vacuum_after_prune: true });
      const result = runner.run();

      expect(result.pruned).toBe(0);
      expect(result.vacuumed).toBe(false);
    });
  });

  // ── Count accuracy ─────────────────────────────────────────────────────────

  describe('result counts', () => {
    it('returns correct total_before and total_after', () => {
      insertMemory(db, { importance: 0.9, ingestion_time: now });          // survives
      insertMemory(db, { importance: 0.9, ingestion_time: now });          // survives
      insertMemory(db, {                                                    // pruned
        type: 'episodic',
        importance: 0.1,
        ingestion_time: daysAgo(100),
      });

      const runner = new MaintenanceRunner(db, { vacuum_after_prune: false });
      const result = runner.run();

      expect(result.total_before).toBe(3);
      expect(result.total_after).toBe(2);
      expect(result.pruned).toBe(1);
    });

    it('total_before equals total_after when nothing is pruned', () => {
      insertMemory(db, { importance: 0.9 });
      insertMemory(db, { importance: 0.8 });

      const runner = new MaintenanceRunner(db, { vacuum_after_prune: false });
      const result = runner.run();

      expect(result.pruned).toBe(0);
      expect(result.total_before).toBe(result.total_after);
      expect(result.total_after).toBe(2);
    });

    it('filters total counts by user_id when user_id is provided', () => {
      insertMemory(db, { user_id: 'user-a', importance: 0.9 });            // survives
      insertMemory(db, {                                                    // pruned (user-a)
        user_id: 'user-a',
        type: 'episodic',
        importance: 0.1,
        ingestion_time: daysAgo(100),
      });
      insertMemory(db, { user_id: 'user-b', importance: 0.9 });            // different user, untouched

      const runner = new MaintenanceRunner(db, { vacuum_after_prune: false });
      const result = runner.run('user-a');

      expect(result.total_before).toBe(2); // only user-a counted
      expect(result.total_after).toBe(1);
      expect(result.pruned).toBe(1);
      // user-b's memory must still exist
      expect(count(db, 'user-b')).toBe(1);
    });
  });

  // ── Custom config ──────────────────────────────────────────────────────────

  describe('custom config', () => {
    it('respects custom episodic_ttl_days', () => {
      // 30-day-old episodic, importance 0.2; with default 90-day TTL it would survive,
      // but with a 20-day TTL it should be pruned.
      insertMemory(db, {
        type: 'episodic',
        importance: 0.2,
        ingestion_time: daysAgo(30),
      });

      const runner = new MaintenanceRunner(db, {
        episodic_ttl_days: 20,
        vacuum_after_prune: false,
      });
      const result = runner.run();

      expect(result.pruned).toBe(1);
    });

    it('respects custom episodic_prune_importance threshold', () => {
      // importance=0.5, normally above default threshold (0.4), so it would survive.
      // But with threshold=0.6 it should be pruned.
      insertMemory(db, {
        type: 'episodic',
        importance: 0.5,
        ingestion_time: daysAgo(100),
      });

      const runner = new MaintenanceRunner(db, {
        episodic_prune_importance: 0.6,
        vacuum_after_prune: false,
      });
      const result = runner.run();

      expect(result.pruned).toBe(1);
    });
  });
});
