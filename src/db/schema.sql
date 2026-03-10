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
