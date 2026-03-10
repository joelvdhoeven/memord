import { pipeline, env } from '@xenova/transformers';
import { join } from 'path';
import { homedir } from 'os';

// Cache models in ~/.memord/models to avoid re-downloading
env.cacheDir = join(homedir(), '.memord', 'models');
env.allowRemoteModels = true;

const MODEL = 'Xenova/all-MiniLM-L6-v2';  // 22MB, 384-dim, fast

let embedder: Awaited<ReturnType<typeof pipeline>> | null = null;

export async function loadEmbedder(): Promise<void> {
  if (embedder) return;
  console.error('[memord] Loading embedding model (first run may download ~22MB)...');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  embedder = await pipeline('feature-extraction', MODEL, { quantized: true } as any);
  console.error('[memord] Embedding model ready.');
}

export async function embed(text: string): Promise<Float32Array> {
  if (!embedder) await loadEmbedder();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const output = await (embedder as any)(text, { pooling: 'mean', normalize: true });
  return output.data as Float32Array;
}

export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (!embedder) await loadEmbedder();
  return Promise.all(texts.map(t => embed(t)));
}

export const EMBEDDING_DIM = 384;
