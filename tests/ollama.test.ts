import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MemoryInput } from '../src/types.js';

// Mock global fetch for all Ollama tests.
// Because ESM modules are cached after the first import, we use vi.resetModules()
// in beforeEach so each test gets a fresh module with a fresh fetch reference.
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('checkOllama()', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it('returns available=true when Ollama is running and model exists', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: 'llama3.2:latest' }] }),
    });
    const { checkOllama } = await import('../src/extractor/ollama.js');
    const status = await checkOllama();
    expect(status.available).toBe(true);
  });

  it('returns available=false when fetch throws (Ollama not running)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const { checkOllama } = await import('../src/extractor/ollama.js');
    const status = await checkOllama();
    expect(status.available).toBe(false);
    expect(status.error).toContain('ECONNREFUSED');
  });

  it('returns available=false when model is not installed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: 'mistral:latest' }] }),
    });
    const { checkOllama } = await import('../src/extractor/ollama.js');
    const status = await checkOllama();
    expect(status.available).toBe(false);
    expect(status.error).toMatch(/not found/i);
  });

  it('returns available=false on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const { checkOllama } = await import('../src/extractor/ollama.js');
    const status = await checkOllama();
    expect(status.available).toBe(false);
  });
});

describe('extractWithOllama()', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  function mockOllamaResponse(content: string) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content } }),
    });
  }

  it('returns parsed memories from valid JSON response', async () => {
    const responseJson = JSON.stringify([
      { content: 'User prefers TypeScript', type: 'preference', importance: 0.8, topic: 'tech_stack' },
    ]);
    mockOllamaResponse(responseJson);
    const { extractWithOllama } = await import('../src/extractor/ollama.js');
    const result = await extractWithOllama('I prefer TypeScript');
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
    expect(result![0].content).toBe('User prefers TypeScript');
    expect(result![0].type).toBe('preference');
    expect(result![0].importance).toBe(0.8);
  });

  it('strips markdown code fences from response', async () => {
    const responseJson =
      '```json\n[{"content":"test fact","type":"project_fact","importance":0.7,"topic":"general"}]\n```';
    mockOllamaResponse(responseJson);
    const { extractWithOllama } = await import('../src/extractor/ollama.js');
    const result = await extractWithOllama('test');
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
  });

  it('returns empty array for empty JSON array response', async () => {
    mockOllamaResponse('[]');
    const { extractWithOllama } = await import('../src/extractor/ollama.js');
    const result = await extractWithOllama('ok thanks');
    expect(result).toEqual([]);
  });

  it('filters out memories below importance threshold (< 0.3)', async () => {
    const responseJson = JSON.stringify([
      { content: 'Low importance', type: 'episodic', importance: 0.2, topic: 'general' },
      { content: 'High importance', type: 'preference', importance: 0.8, topic: 'tech_stack' },
    ]);
    mockOllamaResponse(responseJson);
    const { extractWithOllama } = await import('../src/extractor/ollama.js');
    const result = await extractWithOllama('...');
    expect(result!.length).toBe(1);
    expect(result![0].content).toBe('High importance');
  });

  it('returns null when fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));
    const { extractWithOllama } = await import('../src/extractor/ollama.js');
    const result = await extractWithOllama('test');
    expect(result).toBeNull();
  });

  it('returns null when response is invalid JSON', async () => {
    mockOllamaResponse('not json at all');
    const { extractWithOllama } = await import('../src/extractor/ollama.js');
    const result = await extractWithOllama('test');
    expect(result).toBeNull();
  });

  it('passes options through to returned memories', async () => {
    mockOllamaResponse(
      JSON.stringify([
        { content: 'fact', type: 'project_fact', importance: 0.7, topic: 'general' },
      ]),
    );
    const { extractWithOllama } = await import('../src/extractor/ollama.js');
    const result = await extractWithOllama('test', { app: 'cursor', user_id: 'alice' });
    expect(result![0].app).toBe('cursor');
    expect(result![0].user_id).toBe('alice');
    expect(result![0].source).toBe('ollama_extract');
  });
});

describe('extractSmart()', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it('uses ollama method when Ollama responds', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify([
            { content: 'User prefers vim', type: 'preference', importance: 0.7, topic: 'tech_stack' },
          ]),
        },
      }),
    });
    const { extractSmart } = await import('../src/extractor/ollama.js');
    const result = await extractSmart('I prefer vim for everything');
    expect(result.method).toBe('ollama');
    expect(result.memories.length).toBeGreaterThan(0);
  });

  it('falls back to regex when Ollama is unavailable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const { extractSmart } = await import('../src/extractor/ollama.js');
    const result = await extractSmart('I prefer TypeScript over JavaScript for all projects');
    expect(result.method).toBe('regex');
    // regex should still find a preference
    expect(result.memories.length).toBeGreaterThan(0);
  });

  it('returns ollama method with empty memories when Ollama returns empty array', async () => {
    // Ollama returns [] (nothing found) — still consider it "used Ollama"
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content: '[]' } }),
    });
    const { extractSmart } = await import('../src/extractor/ollama.js');
    const result = await extractSmart('ok thanks sounds good');
    expect(result.method).toBe('ollama');
    expect(result.memories).toEqual([]);
  });
});
