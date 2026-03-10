/**
 * Memory extractor — converts raw conversation text into structured MemoryInput objects.
 * Runs heuristically (no LLM required) with optional Ollama enrichment.
 */
import type { MemoryInput, MemoryType } from '../types.js';

// ── Patterns ──────────────────────────────────────────────────────────────

const MEMORY_TRIGGERS: Array<{ pattern: RegExp; type: MemoryType; importance: number }> = [
  // Explicit "remember that" — highest priority
  { pattern: /\b(remember that|note that|keep in mind that)\s+(.+)/i, type: 'project_fact', importance: 0.95 },

  // Constraints (must not, cannot) — very high importance
  { pattern: /\b(we\s+)?(cannot|can't|must not|must\s+not|should not|should\s+not|never)\s+(.+)/i, type: 'constraint', importance: 0.85 },
  { pattern: /\b(requirement|constraint|limitation):\s*(.+)/i, type: 'constraint', importance: 0.85 },
  { pattern: /\b(don't|do not)\s+use\s+(.+)/i, type: 'constraint', importance: 0.85 },
  { pattern: /\b(\w[\w\s]*)\s+(doesn't work|don't work|does not work|do not work)\s+for us\b/i, type: 'constraint', importance: 0.85 },
  { pattern: /\b(\w[\w\s]*)\s+(is broken|has issues|has a bug|is not working)\b/i, type: 'constraint', importance: 0.80 },

  // Project decisions — high importance
  { pattern: /\bwe\s+(chose|decided\s+to|switched\s+to|migrated\s+to|moved\s+to)\s+(.+)/i, type: 'project_fact', importance: 0.80 },
  { pattern: /\bwe'?re\s+going\s+with\s+(.+)/i, type: 'project_fact', importance: 0.80 },
  { pattern: /\buse\s+(.+?)\s+instead\s+of\s+(.+)/i, type: 'project_fact', importance: 0.80 },
  { pattern: /\b(\w[\w\s]*)\s+is\s+(our|the)\s+(stack|tech|technology|framework|platform)\b/i, type: 'project_fact', importance: 0.80 },
  { pattern: /\b(\w[\w\s]*)\s+is\s+the\s+tech\s+we\s+use\b/i, type: 'project_fact', importance: 0.80 },

  // Project facts
  { pattern: /\b(the\s+)?(project|app|system|service|api)\s+(is|uses|runs on|built with)\s+(.+)/i, type: 'project_fact', importance: 0.80 },
  { pattern: /\bwe\s+(use|built with)\s+(.+)/i, type: 'project_fact', importance: 0.75 },
  { pattern: /\b(tech stack|backend|frontend|database|db)\s+(is|are)\s+(.+)/i, type: 'project_fact', importance: 0.80 },
  { pattern: /\b(the project|this project)\s+is\s+(.+)/i, type: 'project_fact', importance: 0.75 },
  { pattern: /\bwe'?re\s+building\s+(.+)/i, type: 'project_fact', importance: 0.75 },

  // Goals with deadlines — high importance
  { pattern: /\bby\s+(\w+\s+\d{1,2}|\d{1,2}[\/-]\d{1,2}|\w+)\s+(we need to|we must|ship|launch|release|deliver)\s+(.+)/i, type: 'goal', importance: 0.80 },
  { pattern: /\bship\s+(.+?)\s+by\s+(.+)/i, type: 'goal', importance: 0.80 },
  { pattern: /\b(deadline|due date)\s+(is|:)\s*(.+)/i, type: 'goal', importance: 0.80 },
  { pattern: /\bby\s+(end of|next)\s+\w+\s*[,:]?\s*(.+)/i, type: 'goal', importance: 0.80 },

  // Goals (general)
  { pattern: /\b(goal|objective|target|aim):\s*(.+)/i, type: 'goal', importance: 0.75 },
  { pattern: /\bwe\s+(want to|need to|plan to|are going to)\s+(.+)/i, type: 'goal', importance: 0.65 },

  // Personal preferences — moderate importance
  { pattern: /\b(i\s+)(prefer|like|love|enjoy)\s+(.+)/i, type: 'preference', importance: 0.70 },
  { pattern: /\b(i\s+)(hate|dislike|avoid)\s+(.+)/i, type: 'preference', importance: 0.70 },
  { pattern: /\bmy (favorite|preferred|go-to)\s+(.+?)\s+is\s+(.+)/i, type: 'preference', importance: 0.70 },
  { pattern: /\b(always use|stick with|go with)\s+(.+)/i, type: 'preference', importance: 0.70 },
  { pattern: /\bi\s+(always use|always prefer|always go with)\s+(.+)/i, type: 'preference', importance: 0.70 },

  // Work / identity
  { pattern: /\bmy name is\s+(\w+)/i, type: 'preference', importance: 0.95 },
  { pattern: /\bi('m| am)\s+a\s+(.+)/i, type: 'preference', importance: 0.70 },
  { pattern: /\bi\s+(work with|build|develop|maintain)\s+(.+)/i, type: 'preference', importance: 0.70 },

  // Skills/how-to — episodic importance
  { pattern: /\b(how to|the way to|the process for)\s+(.+)\s+(is|:)\s*(.+)/i, type: 'skill', importance: 0.65 },
];

// ── Noise filtering ────────────────────────────────────────────────────────

/**
 * Pure acknowledgements that carry no useful information.
 */
const ACK_PATTERN = /^(ok|okay|yes|no|sure|thanks|thank you|great|awesome|cool|got it|sounds good|perfect|alright|yep|nope|yup|roger|noted|understood|makes sense)[\s!.,?]*$/i;

function isNoise(text: string): boolean {
  const trimmed = text.trim();

  // Too short to carry meaning
  if (trimmed.length < 15) return true;

  // Pure acknowledgement
  if (ACK_PATTERN.test(trimmed)) return true;

  return false;
}

// ── Topic inference ────────────────────────────────────────────────────────

const TOPIC_MAP: Array<[RegExp, string]> = [
  // Authentication / security — check before general tech_stack
  [/\b(auth|authentication|login|logout|oauth|jwt|session|sso|saml|password|token|secret|credential|api key)\b/i, 'auth'],
  [/\b(password|token|secret|encryption|ssl|tls|certificate|vulnerability|xss|csrf|injection)\b/i, 'security'],

  // Deployment / CI/CD
  [/\b(deploy|deployment|ci|cd|pipeline|github actions|gitlab ci|jenkins|docker|kubernetes|k8s|container|helm|terraform|ansible)\b/i, 'deployment'],

  // Testing
  [/\b(test|spec|coverage|jest|vitest|mocha|chai|playwright|cypress|e2e|unit test|integration test|tdd|bdd)\b/i, 'testing'],

  // Performance
  [/\b(fast|slow|performance|optimize|optimization|latency|throughput|benchmark|cache|caching|memory leak|bottleneck)\b/i, 'performance'],

  // Data layer
  [/\b(supabase|postgres|mysql|sqlite|mongodb|redis|prisma|drizzle|orm|migration|schema|query|database|db)\b/i, 'data_layer'],

  // Infrastructure
  [/\b(aws|gcp|azure|vercel|netlify|fly\.io|railway|cloudflare|cdn|s3|lambda|serverless)\b/i, 'infrastructure'],

  // Tech stack (language / framework)
  [/\b(typescript|javascript|python|rust|go|java|ruby|php|swift|kotlin|c\+\+|c#)\b/i, 'tech_stack'],
  [/\b(react|vue|svelte|angular|nextjs|next\.js|remix|astro|nuxt)\b/i, 'tech_stack'],
  [/\b(node|deno|bun|express|fastify|hono|koa|nestjs)\b/i, 'tech_stack'],

  // Timeline
  [/\b(deadline|sprint|milestone|release|ship|launch|by \w+|due date)\b/i, 'timeline'],

  // People
  [/\b(team|colleague|manager|client|customer|user)\b/i, 'people'],

  // Issues / bugs
  [/\b(bug|error|issue|problem|broken|fix|crash|exception|traceback)\b/i, 'issues'],

  // Goals
  [/\b(goal|objective|aim|want to|need to|plan to)\b/i, 'goals'],

  // User bio
  [/\b(name is|i am|i'm a|work at|located in|live in)\b/i, 'user_bio'],
];

function inferTopic(text: string): string {
  for (const [pattern, topic] of TOPIC_MAP) {
    if (pattern.test(text)) return topic;
  }
  return 'general';
}

// ── Sentence chunking ──────────────────────────────────────────────────────

/**
 * Split text into sentence-like chunks. Handles:
 *   - Terminal punctuation: . ! ?
 *   - Newlines
 *   - Semicolons used as sentence separators
 *   - Em-dash / spaced dash used as clause separators
 *   - Bullet-point list items (lines starting with "- " or "* ")
 */
function chunkIntoSentences(text: string): string[] {
  // First, normalise bullet points so each item ends up on its own line
  const withBulletBreaks = text.replace(/(\s*[-*])\s+/g, '\n$1 ');

  const chunks: string[] = [];

  for (const line of withBulletBreaks.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Strip leading bullet marker so the content is cleaner
    const content = trimmedLine.replace(/^[-*]\s+/, '');

    // Within each line, split further on . ! ? and ; and " - "
    const subChunks = content
      .split(/(?<=[.!?;])\s+|(?<=\s)-\s+(?=\S)/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    chunks.push(...subChunks);
  }

  return chunks;
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
  const sentences = chunkIntoSentences(text)
    .filter(s => !isNoise(s));

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
        break; // one match per sentence
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
