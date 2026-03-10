/**
 * Ollama-based memory extractor.
 * Optional enrichment layer — falls back to regex if Ollama is unavailable.
 * No API key required. Runs fully locally.
 */
import type { MemoryInput } from '../types.js';
import { extractFromText } from './index.js';

const OLLAMA_BASE = process.env.MEMORD_OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.MEMORD_OLLAMA_MODEL ?? 'llama3.2';

// Prompt that returns structured JSON
const SYSTEM_PROMPT = `You are a memory extraction assistant for an AI memory system.

Extract factual, memorable information from the conversation text. Return a JSON array of memory objects.

Each memory object must have:
- "content": string — the specific fact, preference, or constraint (1-2 sentences, self-contained)
- "type": one of "preference" | "project_fact" | "constraint" | "goal" | "episodic" | "skill"
- "importance": number between 0.0-1.0
  - 0.9-1.0: explicit instructions ("remember that", "my name is")
  - 0.8-0.9: hard constraints, deadlines, critical decisions
  - 0.7-0.8: project facts, tech decisions, preferences
  - 0.5-0.7: soft preferences, work context
  - below 0.3: don't include
- "topic": one of "tech_stack" | "project" | "preferences" | "constraints" | "goals" | "auth" | "deployment" | "testing" | "performance" | "security" | "data_layer" | "infrastructure" | "people" | "user_bio" | "general"

Rules:
- Only include genuinely memorable long-term facts
- Skip: greetings, filler, acknowledgements, one-time context, questions without answers
- Be specific: "uses TypeScript" not "user said something about TypeScript"
- Return ONLY valid JSON array, no explanation, no markdown

Example output:
[
  {"content": "User prefers TypeScript over JavaScript for all new projects", "type": "preference", "importance": 0.75, "topic": "tech_stack"},
  {"content": "We cannot use paid external APIs due to budget constraints", "type": "constraint", "importance": 0.85, "topic": "constraints"}
]

If nothing memorable is found, return: []`;

export interface OllamaStatus {
  available: boolean;
  model?: string;
  error?: string;
}

/**
 * Check if Ollama is running and the configured model is available.
 */
export async function checkOllama(): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { available: false, error: `HTTP ${res.status}` };
    const data = await res.json() as { models?: Array<{ name: string }> };
    const models = data.models ?? [];
    const hasModel = models.some(m => m.name.startsWith(OLLAMA_MODEL));
    if (!hasModel) {
      const available_models = models.map(m => m.name).join(', ');
      return { available: false, error: `Model "${OLLAMA_MODEL}" not found. Available: ${available_models || 'none'}` };
    }
    return { available: true, model: OLLAMA_MODEL };
  } catch (err) {
    return { available: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Extract memories from text using Ollama LLM.
 * Returns null if Ollama is unavailable (use fallback).
 */
export async function extractWithOllama(
  text: string,
  options: { source?: MemoryInput['source']; app?: string; user_id?: string } = {}
): Promise<MemoryInput[] | null> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Extract memories from this text:\n\n${text}` },
        ],
        options: {
          temperature: 0.1,   // low temp = consistent structured output
          num_predict: 1024,
        },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json() as { message?: { content?: string } };
    const raw = data.message?.content?.trim() ?? '';

    // Strip markdown code fences if model wraps in ```json ... ```
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

    const parsed = JSON.parse(cleaned) as Array<{
      content: string;
      type: string;
      importance: number;
      topic: string;
    }>;

    if (!Array.isArray(parsed)) return null;

    return parsed
      .filter(m => m.content && typeof m.importance === 'number' && m.importance >= 0.3)
      .map(m => ({
        content: String(m.content).trim(),
        type: m.type as MemoryInput['type'],
        topic: String(m.topic),
        importance: Number(m.importance),
        source: (options.source ?? 'ollama_extract') as MemoryInput['source'],
        app: options.app ?? 'unknown',
        user_id: options.user_id ?? 'default',
      }));
  } catch {
    return null;
  }
}

/**
 * Smart extraction: tries Ollama first, falls back to regex if unavailable.
 */
export async function extractSmart(
  text: string,
  options: { source?: MemoryInput['source']; app?: string; user_id?: string } = {}
): Promise<{ memories: MemoryInput[]; method: 'ollama' | 'regex' }> {
  const ollamaResult = await extractWithOllama(text, options);
  if (ollamaResult !== null) {
    return { memories: ollamaResult, method: 'ollama' };
  }
  // Fallback to regex extractor
  const memories = extractFromText(text, options);
  return { memories, method: 'regex' };
}
