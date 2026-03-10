export type MemoryType = 'preference' | 'project_fact' | 'constraint' | 'goal' | 'episodic' | 'skill';
export type MemorySource = 'claude_compact' | 'manual' | 'session_end' | 'explicit' | 'auto_extract';

export interface Memory {
  id: string;
  type: MemoryType;
  topic: string;
  content: string;
  importance: number;      // 0.0 - 1.0
  source: MemorySource;
  app: string;             // "claude-desktop" | "cursor" | "windsurf" | etc
  user_id: string;
  event_time: number;      // ms unix timestamp (when it happened)
  ingestion_time: number;  // ms unix timestamp (when we recorded it)
  last_accessed: number;
  access_count: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface MemoryInput {
  content: string;
  type?: MemoryType;
  topic?: string;
  importance?: number;
  source?: MemorySource;
  app?: string;
  user_id?: string;
  event_time?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface RecallOptions {
  query: string;
  user_id?: string;
  app?: string;
  types?: MemoryType[];
  limit?: number;
  since?: number;          // unix ms timestamp
  min_importance?: number;
}

export interface RecallResult {
  memory: Memory;
  score: number;
}

export interface MemordConfig {
  db_path: string;
  user_id: string;
  http_port: number;
  importance_threshold: number;
  similarity_threshold: number;  // cosine similarity above this = dedupe
}
