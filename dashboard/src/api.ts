export interface Memory {
  id: string;
  type: 'preference' | 'project_fact' | 'constraint' | 'goal' | 'episodic' | 'skill';
  topic: string;
  content: string;
  importance: number;
  source: string;
  app: string;
  user_id: string;
  event_time: number;
  ingestion_time: number;
  last_accessed: number;
  access_count: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface Stats {
  total: number;
  by_type: Record<string, number>;
  oldest: number;
  newest: number;
}

export interface RecallResult {
  memory: Memory;
  score: number;
}

export interface OllamaStatus {
  available: boolean;
  model?: string;
  error?: string;
}

const BASE = '';  // same origin in prod, proxied in dev

export async function fetchMemories(limit = 50): Promise<Memory[]> {
  const res = await fetch(`${BASE}/memories?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch memories');
  const data = await res.json() as { memories?: Memory[] } | Memory[];
  return Array.isArray(data) ? data : (data.memories ?? []);
}

export async function searchMemories(q: string, limit = 30): Promise<RecallResult[]> {
  const res = await fetch(`${BASE}/memories/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!res.ok) throw new Error('Search failed');
  const data = await res.json() as { results?: RecallResult[] } | RecallResult[];
  return Array.isArray(data) ? data : (data.results ?? []);
}

export async function deleteMemory(id: string): Promise<void> {
  await fetch(`${BASE}/memories/${id}`, { method: 'DELETE' });
}

export async function addMemory(content: string, type: Memory['type'], importance: number): Promise<{ memory: Memory; action: string }> {
  const res = await fetch(`${BASE}/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, type, importance, source: 'manual', app: 'dashboard' }),
  });
  if (!res.ok) throw new Error('Failed to add memory');
  return res.json();
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${BASE}/stats`);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function fetchOllamaStatus(): Promise<OllamaStatus> {
  const res = await fetch(`${BASE}/ollama/status`);
  if (!res.ok) return { available: false, error: 'HTTP error' };
  return res.json();
}

export async function triggerMaintenance(): Promise<{ pruned: number }> {
  const res = await fetch(`${BASE}/maintenance`, { method: 'POST' });
  if (!res.ok) throw new Error('Maintenance failed');
  return res.json();
}
