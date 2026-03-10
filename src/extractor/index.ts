/**
 * Memory extractor — converts raw conversation text into structured MemoryInput objects.
 * Runs heuristically (no LLM required) with optional Ollama enrichment.
 */
import type { MemoryInput, MemoryType } from '../types.js';

// ── Patterns ──────────────────────────────────────────────────────────────

const MEMORY_TRIGGERS: Array<{ pattern: RegExp; type: MemoryType; importance: number }> = [
  // Explicit preferences
  { pattern: /\b(i\s+)(prefer|like|love|enjoy|always use|use)\s+(.+)/i, type: 'preference', importance: 0.7 },
  { pattern: /\b(i\s+)(hate|dislike|never use|avoid)\s+(.+)/i, type: 'preference', importance: 0.7 },
  { pattern: /\bmy (favorite|preferred|go-to)\s+(.+?)\s+is\s+(.+)/i, type: 'preference', importance: 0.75 },

  // Project facts
  { pattern: /\b(the\s+)?(project|app|system|service|api)\s+(is|uses|runs on|built with)\s+(.+)/i, type: 'project_fact', importance: 0.8 },
  { pattern: /\bwe\s+(use|chose|decided|switched to|built with)\s+(.+)/i, type: 'project_fact', importance: 0.75 },
  { pattern: /\b(tech stack|backend|frontend|database|db)\s+(is|are)\s+(.+)/i, type: 'project_fact', importance: 0.8 },

  // Constraints
  { pattern: /\b(we\s+)?(cannot|can't|must not|should not|never)\s+(.+)/i, type: 'constraint', importance: 0.85 },
  { pattern: /\b(requirement|constraint|limitation):\s*(.+)/i, type: 'constraint', importance: 0.85 },

  // Goals
  { pattern: /\b(goal|objective|target|aim):\s*(.+)/i, type: 'goal', importance: 0.8 },
  { pattern: /\bwe\s+(want to|need to|plan to|are going to)\s+(.+)/i, type: 'goal', importance: 0.65 },
  { pattern: /\bby\s+(end of|next)\s+\w+\s*[,:]?\s*(.+)/i, type: 'goal', importance: 0.75 },

  // Skills/how-to
  { pattern: /\b(how to|the way to|the process for)\s+(.+)\s+(is|:)\s*(.+)/i, type: 'skill', importance: 0.7 },

  // Explicit remember
  { pattern: /\b(remember that|note that|keep in mind that)\s+(.+)/i, type: 'project_fact', importance: 0.9 },
  { pattern: /\bmy name is\s+(\w+)/i, type: 'preference', importance: 0.95 },
  { pattern: /\bi('m| am)\s+a\s+(.+)/i, type: 'preference', importance: 0.7 },
];

const NOISE_PATTERNS = [
  /^(ok|okay|yes|no|sure|thanks|thank you|great|awesome|cool|got it)[\s!.]*$/i,
  /^.{1,10}$/,  // too short
  /\b(the|a|an|is|are|was|were|be)\b/i,  // mostly stop words
];

// ── Topic inference ────────────────────────────────────────────────────────

const TOPIC_MAP: Array<[RegExp, string]> = [
  [/\b(typescript|javascript|python|rust|go|java|ruby|php|swift|kotlin)\b/i, 'tech_stack'],
  [/\b(react|vue|svelte|angular|nextjs|next\.js)\b/i, 'tech_stack'],
  [/\b(node|deno|bun|express|fastify|hono)\b/i, 'tech_stack'],
  [/\b(supabase|postgres|mysql|sqlite|mongodb|redis|prisma)\b/i, 'data_layer'],
  [/\b(aws|gcp|azure|vercel|netlify|fly\.io|railway)\b/i, 'infrastructure'],
  [/\b(deadline|sprint|milestone|release|ship|launch)\b/i, 'timeline'],
  [/\b(team|colleague|manager|client|customer|user)\b/i, 'people'],
  [/\b(bug|error|issue|problem|broken|fix)\b/i, 'issues'],
  [/\b(name is|i am|i'm a|work at|located in|live in)\b/i, 'user_bio'],
  [/\b(goal|objective|aim|want to|need to|plan to)\b/i, 'goals'],
];

function inferTopic(text: string): string {
  for (const [pattern, topic] of TOPIC_MAP) {
    if (pattern.test(text)) return topic;
  }
  return 'general';
}

function isNoise(text: string): boolean {
  return NOISE_PATTERNS.some(p => p.test(text.trim()));
}

// ── Main extractor ─────────────────────────────────────────────────────────

export interface ExtractOptions {
  source?: MemoryInput['source'];
  app?: string;
  user_id?: string;
}

/**
 * Extract structured memories from a conversation text block.
 * Typically called with the content of a compact summary or session recap.
 */
export function extractFromText(text: string, options: ExtractOptions = {}): MemoryInput[] {
  const sentences = text
    .split(/[.!?\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10 && !isNoise(s));

  const memories: MemoryInput[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences) {
    for (const { pattern, type, importance } of MEMORY_TRIGGERS) {
      if (pattern.test(sentence)) {
        const normalized = sentence.toLowerCase().replace(/\s+/g, ' ').trim();
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        memories.push({
          content: sentence.trim(),
          type,
          topic: inferTopic(sentence),
          importance,
          source: options.source ?? 'auto_extract',
          app: options.app ?? 'unknown',
          user_id: options.user_id ?? 'default',
        });
        break;  // one match per sentence
      }
    }
  }

  return memories;
}

/**
 * Extract memories from a conversation message array (Claude format).
 */
export function extractFromMessages(
  messages: Array<{ role: string; content: string }>,
  options: ExtractOptions = {}
): MemoryInput[] {
  // Focus on user messages — they contain the ground truth about preferences/facts
  const userText = messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n');
  return extractFromText(userText, options);
}

/**
 * Extract memories from a compact/summarized conversation text.
 * Same as extractFromText but marks source as 'claude_compact'.
 */
export function extractFromCompact(summary: string, options: Omit<ExtractOptions, 'source'> = {}): MemoryInput[] {
  return extractFromText(summary, { ...options, source: 'claude_compact' });
}
