import { pipeline, env } from '@xenova/transformers';
import { join } from 'path';
import { homedir } from 'os';

// Cache models in ~/.memord/models to avoid re-downloading
env.cacheDir = join(homedir(), '.memord', 'models');
env.allowRemoteModels = true;

// L-2: e5-small-v2 — same 384-dim as all-MiniLM but Top-5 RAG accuracy ~100% vs 28%
// Uses E5 instruction format: prefix "query: " for search, "passage: " for stored text
const MODEL = 'Xenova/e5-small-v2';  // 33MB, 384-dim

let embedder: Awaited<ReturnType<typeof pipeline>> | null = null;

export async function loadEmbedder(): Promise<void> {
  if (embedder) return;
  console.error('[memord] Loading embedding model (first run may download ~33MB)...');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  embedder = await pipeline('feature-extraction', MODEL, { quantized: true } as any);
  console.error('[memord] Embedding model ready.');
}

export async function embed(text: string, role: 'query' | 'passage' = 'passage'): Promise<Float32Array> {
  if (!embedder) await loadEmbedder();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const output = await (embedder as any)(`${role}: ${text}`, { pooling: 'mean', normalize: true });
  return output.data as Float32Array;
}

// L-4: true ONNX matrix batching — single forward pass instead of sequential Promise.all
export async function embedBatch(texts: string[], role: 'query' | 'passage' = 'passage'): Promise<Float32Array[]> {
  if (!embedder) await loadEmbedder();
  const prefixed = texts.map(t => `${role}: ${t}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const output = await (embedder as any)(prefixed, { pooling: 'mean', normalize: true });
  return Array.from({ length: texts.length }, (_, i) =>
    output.data.slice(i * EMBEDDING_DIM, (i + 1) * EMBEDDING_DIM)
  );
}

export const EMBEDDING_DIM = 384;
