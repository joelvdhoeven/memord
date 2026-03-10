import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import type { Memory } from '../types.js';

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
CREATE INDEX IF NOT EXISTS idx_memories_topic ON memories(topic);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_ingestion_time ON memories(ingestion_time DESC);
CREATE INDEX IF NOT EXISTS idx_memories_last_accessed ON memories(last_accessed DESC);
`;

export function cosineDistance(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 1 : 1 - dot / denom;
}

function rowToMemory(row: Record<string, unknown>): Memory {
  return {
    id: row.id as string,
    type: row.type as Memory['type'],
    topic: row.topic as string,
    content: row.content as string,
    importance: row.importance as number,
    source: row.source as Memory['source'],
    app: row.app as string,
    user_id: row.user_id as string,
    event_time: row.event_time as number,
    ingestion_time: row.ingestion_time as number,
    last_accessed: row.last_accessed as number,
    access_count: row.access_count as number,
    tags: row.tags ? JSON.parse(row.tags as string) : undefined,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
  };
}

export function createDb(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(SCHEMA_SQL);
  return db;
}

export class DbClient {
  private static readonly UPDATABLE_FIELDS = new Set([
    'type', 'topic', 'content', 'importance', 'source', 'app',
    'user_id', 'event_time', 'last_accessed', 'access_count', 'tags', 'metadata'
  ]);

  constructor(private db: Database.Database) {}

  insert(memory: Memory, embedding?: Float32Array): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO memories
        (id, type, topic, content, importance, source, app, user_id,
         event_time, ingestion_time, last_accessed, access_count, tags, metadata, embedding)
      VALUES
        (@id, @type, @topic, @content, @importance, @source, @app, @user_id,
         @event_time, @ingestion_time, @last_accessed, @access_count, @tags, @metadata, @embedding)
    `).run({
      ...memory,
      tags: memory.tags ? JSON.stringify(memory.tags) : null,
      metadata: memory.metadata ? JSON.stringify(memory.metadata) : null,
      embedding: embedding ? Buffer.from(embedding.buffer) : null,
    });
  }

  getById(id: string): Memory | null {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? rowToMemory(row) : null;
  }

  getEmbedding(id: string): Float32Array | null {
    const row = this.db.prepare('SELECT embedding FROM memories WHERE id = ?').get(id) as { embedding: Buffer | null } | undefined;
    if (!row?.embedding) return null;
    return new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
  }

  update(id: string, updates: Partial<Memory>): void {
    const safeKeys = Object.keys(updates).filter(k => DbClient.UPDATABLE_FIELDS.has(k));
    if (safeKeys.length === 0) return;
    const fields = safeKeys.map(k => `${k} = @${k}`).join(', ');
    const params: Record<string, unknown> = { id, ...updates };
    if (updates.tags) params.tags = JSON.stringify(updates.tags);
    if (updates.metadata) params.metadata = JSON.stringify(updates.metadata);
    this.db.prepare(`UPDATE memories SET ${fields} WHERE id = @id`).run(params);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    return result.changes > 0;
  }

  list(options: { user_id?: string; app?: string; limit?: number; offset?: number; since?: number } = {}): Memory[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (options.user_id) { conditions.push('user_id = @user_id'); params.user_id = options.user_id; }
    if (options.app) { conditions.push('app = @app'); params.app = options.app; }
    if (options.since) { conditions.push('ingestion_time >= @since'); params.since = options.since; }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.limit = options.limit ?? 50;
    params.offset = options.offset ?? 0;

    const rows = this.db.prepare(
      `SELECT * FROM memories ${where} ORDER BY ingestion_time DESC LIMIT @limit OFFSET @offset`
    ).all(params) as Record<string, unknown>[];
    return rows.map(rowToMemory);
  }

  searchFts(query: string, options: { user_id?: string; limit?: number } = {}): Array<{ memory: Memory; rank: number }> {
    const userFilter = options.user_id ? 'AND m.user_id = @user_id' : '';
    const rows = this.db.prepare(`
      SELECT m.*, f.rank
      FROM memories_fts f
      JOIN memories m ON m.rowid = f.rowid
      WHERE memories_fts MATCH @query ${userFilter}
      ORDER BY f.rank
      LIMIT @limit
    `).all({ query, user_id: options.user_id ?? null, limit: options.limit ?? 20 }) as Array<Record<string, unknown>>;

    return rows.map(row => ({ memory: rowToMemory(row), rank: row.rank as number }));
  }

  getAllWithEmbeddings(user_id?: string): Array<{ memory: Memory; embedding: Float32Array }> {
    const where = user_id ? 'WHERE user_id = ? AND embedding IS NOT NULL' : 'WHERE embedding IS NOT NULL';
    const params = user_id ? [user_id] : [];
    const rows = this.db.prepare(`SELECT * FROM memories ${where}`).all(...params) as Array<Record<string, unknown>>;
    return rows
      .map(row => {
        const embBuf = row.embedding as Buffer | null;
        if (!embBuf) return null;
        return {
          memory: rowToMemory(row),
          embedding: new Float32Array(embBuf.buffer, embBuf.byteOffset, embBuf.byteLength / 4),
        };
      })
      .filter(Boolean) as Array<{ memory: Memory; embedding: Float32Array }>;
  }

  /**
   * Returns at most `limit` memories that have embeddings, ordered by
   * importance DESC then last_accessed DESC.  Use this instead of
   * getAllWithEmbeddings() for vector-search pre-filtering so that we never
   * load the entire corpus into JS heap.
   */
  getTopCandidates(user_id?: string, limit = 500): Array<{ memory: Memory; embedding: Float32Array }> {
    const where = user_id
      ? 'WHERE user_id = ? AND embedding IS NOT NULL'
      : 'WHERE embedding IS NOT NULL';
    const params: unknown[] = user_id ? [user_id, limit] : [limit];
    const rows = this.db.prepare(
      `SELECT * FROM memories ${where} ORDER BY importance DESC, last_accessed DESC LIMIT ?`
    ).all(...params) as Array<Record<string, unknown>>;
    return rows.map(row => ({
      memory: rowToMemory(row),
      embedding: new Float32Array(
        (row.embedding as Buffer).buffer,
        (row.embedding as Buffer).byteOffset,
        (row.embedding as Buffer).byteLength / 4,
      ),
    }));
  }


  /**
   * Fetch specific memories by ID, returning only those that have a stored
   * embedding.  Used to guarantee FTS hits are always in the vector-scoring
   * pool regardless of their importance/recency rank.
   */
  getByIds(ids: string[]): Array<{ memory: Memory; embedding: Float32Array }> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db.prepare(
      `SELECT * FROM memories WHERE id IN (${placeholders}) AND embedding IS NOT NULL`
    ).all(...ids) as Array<Record<string, unknown>>;
    return rows.map(row => ({
      memory: rowToMemory(row),
      embedding: new Float32Array(
        (row.embedding as Buffer).buffer,
        (row.embedding as Buffer).byteOffset,
        (row.embedding as Buffer).byteLength / 4,
      ),
    }));
  }
  /** Count of memories that have a stored embedding vector. */
  countWithEmbeddings(user_id?: string): number {
    const where = user_id ? 'WHERE user_id = ? AND embedding IS NOT NULL' : 'WHERE embedding IS NOT NULL';
    const params = user_id ? [user_id] : [];
    return (this.db.prepare(`SELECT COUNT(*) as c FROM memories ${where}`).get(...params) as { c: number }).c;
  }

  updateEmbedding(id: string, embedding: Float32Array): void {
    this.db.prepare('UPDATE memories SET embedding = ? WHERE id = ?').run(Buffer.from(embedding.buffer), id);
  }

  touchAccessed(id: string): void {
    this.db.prepare(`
      UPDATE memories SET last_accessed = @now, access_count = access_count + 1 WHERE id = @id
    `).run({ id, now: Date.now() });
  }

  stats(user_id?: string): { total: number; by_type: Record<string, number>; oldest: number; newest: number } {
    const where = user_id ? 'WHERE user_id = ?' : '';
    const params = user_id ? [user_id] : [];

    const total = (this.db.prepare(`SELECT COUNT(*) as c FROM memories ${where}`).get(...params) as { c: number }).c;
    const byType = this.db.prepare(`SELECT type, COUNT(*) as c FROM memories ${where} GROUP BY type`).all(...params) as Array<{ type: string; c: number }>;
    const timeRow = this.db.prepare(`SELECT MIN(ingestion_time) as oldest, MAX(ingestion_time) as newest FROM memories ${where}`).get(...params) as { oldest: number; newest: number };

    return {
      total,
      by_type: Object.fromEntries(byType.map(r => [r.type, r.c])),
      oldest: timeRow.oldest ?? 0,
      newest: timeRow.newest ?? 0,
    };
  }
}
