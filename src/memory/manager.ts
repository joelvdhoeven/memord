import { randomUUID } from 'crypto';
import { DbClient, cosineDistance } from '../db/client.js';
import { embed } from '../embeddings/index.js';
import type { Memory, MemoryInput, MemoryType, RecallOptions, RecallResult, MemordConfig } from '../types.js';

const DEFAULT_CONFIG: Partial<MemordConfig> = {
  importance_threshold: 0.3,
  similarity_threshold: 0.08,  // cosine distance below this = duplicate
};

// Classify topic heuristically if not provided
const TOPIC_PATTERNS: Array<[RegExp, string]> = [
  [/\b(typescript|javascript|python|rust|go|java|node|react|vue|svelte)\b/i, 'tech_stack'],
  [/\b(prefers?|likes?|loves?|hates?|dislikes?|favorite|prefer)\b/i, 'preferences'],
  [/\b(project|app|product|system|service|api|backend|frontend)\b/i, 'project'],
  [/\b(deadline|due|sprint|milestone|release|ship)\b/i, 'timeline'],
  [/\b(team|colleague|manager|client|user|customer)\b/i, 'people'],
  [/\b(bug|error|issue|problem|fix|broken)\b/i, 'issues'],
  [/\b(supabase|postgres|mysql|sqlite|mongodb|redis|database|db)\b/i, 'data_layer'],
];

function inferTopic(content: string): string {
  for (const [pattern, topic] of TOPIC_PATTERNS) {
    if (pattern.test(content)) return topic;
  }
  return 'general';
}

// RRF fusion score
function rrfScore(positions: number[], k = 60): number {
  return positions.reduce((sum, pos) => sum + 1 / (k + pos), 0);
}

// Recency decay: half-life of ~11 days
function recencyScore(lastAccessed: number): number {
  const daysSince = (Date.now() - lastAccessed) / 86_400_000;
  return Math.exp(-0.693 * daysSince / 11.25);
}

// MMR reranking for diversity
function mmrRerank(queryEmbedding: Float32Array, candidates: Array<{ memory: Memory; embedding: Float32Array; baseScore: number }>, lambda = 0.7, topK = 10): RecallResult[] {
  const selected: typeof candidates = [];
  const remaining = [...candidates];

  while (selected.length < topK && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const relevance = 1 - cosineDistance(queryEmbedding, remaining[i].embedding);
      const maxSim = selected.length === 0
        ? 0
        : Math.max(...selected.map(s => 1 - cosineDistance(remaining[i].embedding, s.embedding)));
      const score = lambda * relevance - (1 - lambda) * maxSim;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }

    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }

  return selected.map(c => ({ memory: c.memory, score: c.baseScore }));
}

export class MemoryManager {
  private config: MemordConfig;

  constructor(private db: DbClient, config: Partial<MemordConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config } as MemordConfig;
  }

  // ── Write ────────────────────────────────────────────────────────────────

  async remember(input: MemoryInput): Promise<{ memory: Memory; action: 'added' | 'updated' | 'skipped' }> {
    const importance = input.importance ?? 0.5;

    // Quality gate 1: importance threshold
    if (importance < this.config.importance_threshold) {
      return { memory: this.buildMemory(input), action: 'skipped' };
    }

    const embedding = await embed(input.content);

    // Quality gate 2: similarity dedupe — only scan top 500 most recent+important
    // to avoid an O(n) full-table scan on every insert.
    const existing = this.db.getTopCandidates(input.user_id ?? 'default', 500);
    for (const { memory, embedding: existingEmb } of existing) {
      const dist = cosineDistance(embedding, existingEmb);
      if (dist < this.config.similarity_threshold) {
        // Too similar — update instead of add
        const updated: Memory = { ...memory, content: input.content, last_accessed: Date.now() };
        this.db.update(memory.id, { content: input.content, last_accessed: Date.now() });
        return { memory: updated, action: 'updated' };
      }
    }

    const memory = this.buildMemory(input);
    this.db.insert(memory, embedding);
    return { memory, action: 'added' };
  }

  private buildMemory(input: MemoryInput): Memory {
    const now = Date.now();
    return {
      id: randomUUID(),
      type: (input.type ?? 'episodic') as MemoryType,
      topic: input.topic ?? inferTopic(input.content),
      content: input.content,
      importance: input.importance ?? 0.5,
      source: input.source ?? 'manual',
      app: input.app ?? 'unknown',
      user_id: input.user_id ?? 'default',
      event_time: input.event_time ?? now,
      ingestion_time: now,
      last_accessed: now,
      access_count: 0,
      tags: input.tags,
      metadata: input.metadata,
    };
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  async recall(options: RecallOptions): Promise<RecallResult[]> {
    const limit = options.limit ?? 10;
    const userId = options.user_id ?? 'default';

    const queryEmbedding = await embed(options.query);

    // FTS search
    const ftsResults = this.db.searchFts(options.query, { user_id: userId, limit: 20 });

    // Vector search — pre-filter to top 500 by importance+recency so that
    // JS-side cosine comparison never iterates the full corpus.
    const topCandidates = this.db.getTopCandidates(userId, 500);

    // Ensure every FTS hit is included in the candidate pool for vector
    // scoring, even if it falls outside the top-500 importance/recency window.
    const ftsIds = ftsResults.map(r => r.memory.id);
    const topIds = new Set(topCandidates.map(c => c.memory.id));
    const ftsOnlyIds = ftsIds.filter(id => !topIds.has(id));
    const ftsCandidates = this.db.getByIds(ftsOnlyIds);
    const candidates = [...topCandidates, ...ftsCandidates];

    const vectorResults = candidates
      .map(({ memory, embedding }) => ({ memory, embedding, dist: cosineDistance(queryEmbedding, embedding) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 20);

    // Build position maps for RRF
    const vecIds = vectorResults.map(r => r.memory.id);
    const allIds = [...new Set([...ftsIds, ...vecIds])];

    const embeddingMap = new Map(candidates.map(e => [e.memory.id, e.embedding]));
    const memoryMap = new Map([
      ...ftsResults.map(r => [r.memory.id, r.memory] as const),
      ...vectorResults.map(r => [r.memory.id, r.memory] as const),
    ]);

    const scored = allIds.map(id => {
      const ftsPos = ftsIds.indexOf(id);
      const vecPos = vecIds.indexOf(id);
      const positions = [
        ...(ftsPos >= 0 ? [ftsPos] : []),
        ...(vecPos >= 0 ? [vecPos] : []),
      ];
      const base = rrfScore(positions);
      const memory = memoryMap.get(id)!;
      const recency = recencyScore(memory.last_accessed);
      const importance = memory.importance;
      const finalScore = base * 0.7 + recency * 0.2 + importance * 0.1;
      return { memory, embedding: embeddingMap.get(id)!, baseScore: finalScore };
    });

    // Apply filters
    let filtered = scored.filter(s => {
      if (options.types && !options.types.includes(s.memory.type)) return false;
      if (options.min_importance && s.memory.importance < options.min_importance) return false;
      if (options.since && s.memory.event_time < options.since) return false;
      if (options.app && s.memory.app !== options.app) return false;
      return true;
    });

    // MMR rerank for diversity
    const results = filtered.some(f => f.embedding)
      ? mmrRerank(queryEmbedding, filtered.filter(f => f.embedding), 0.7, limit)
      : filtered.slice(0, limit).map(f => ({ memory: f.memory, score: f.baseScore }));

    // Touch accessed
    results.forEach(r => this.db.touchAccessed(r.memory.id));

    return results;
  }

  async reflect(topic: string, userId = 'default'): Promise<{ topic: string; memories: Memory[]; summary: string }> {
    const results = await this.recall({ query: topic, user_id: userId, limit: 15 });
    const memories = results.map(r => r.memory);
    const summary = memories.length === 0
      ? `No memories found about "${topic}".`
      : `Found ${memories.length} memories about "${topic}". Most recent: ${memories[0].content}`;
    return { topic, memories, summary };
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  forget(id: string): boolean {
    return this.db.delete(id);
  }

  // ── List ─────────────────────────────────────────────────────────────────

  listRecent(options: { user_id?: string; limit?: number; since_hours?: number } = {}): Memory[] {
    const since = options.since_hours ? Date.now() - options.since_hours * 3_600_000 : undefined;
    return this.db.list({ user_id: options.user_id ?? 'default', limit: options.limit ?? 20, since });
  }

  stats(userId?: string) {
    return this.db.stats(userId);
  }

  // ── Smart extraction ─────────────────────────────────────────────────────

  async extractAndRemember(
    text: string,
    options: { app?: string; user_id?: string } = {}
  ): Promise<{ added: number; updated: number; skipped: number; method: 'ollama' | 'regex' }> {
    const { extractSmart } = await import('../extractor/ollama.js');
    const { memories, method } = await extractSmart(text, {
      app: options.app,
      user_id: options.user_id ?? this.config.user_id,
    });

    let added = 0, updated = 0, skipped = 0;
    for (const input of memories) {
      const result = await this.remember({ ...input, user_id: options.user_id ?? this.config.user_id });
      if (result.action === 'added') added++;
      else if (result.action === 'updated') updated++;
      else skipped++;
    }
    return { added, updated, skipped, method };
  }
}
