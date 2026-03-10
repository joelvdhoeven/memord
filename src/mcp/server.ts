import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { MemoryManager } from '../memory/manager.js';
import type { MemoryType, MemorySource } from '../types.js';

const RememberSchema = z.object({
  content: z.string().describe('The information to remember'),
  type: z.enum(['preference', 'project_fact', 'constraint', 'goal', 'episodic', 'skill']).optional(),
  topic: z.string().optional().describe('Topic category, e.g. "tech_stack", "user_bio"'),
  importance: z.number().min(0).max(1).optional().describe('0 = trivial, 1 = critical'),
  source: z.enum(['claude_compact', 'manual', 'session_end', 'explicit', 'auto_extract', 'ollama_extract']).optional(),
  app: z.string().optional().describe('Which AI tool is writing this memory'),
  user_id: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const RecallSchema = z.object({
  query: z.string().describe('What to search for'),
  user_id: z.string().optional(),
  types: z.array(z.enum(['preference', 'project_fact', 'constraint', 'goal', 'episodic', 'skill'])).optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
  since: z.string().optional().describe('ISO date string — only recall memories after this date'),
  min_importance: z.number().min(0).max(1).optional(),
  app: z.string().optional(),
});

const ForgetSchema = z.object({
  memory_id: z.string().describe('ID of the memory to delete'),
});

const ReflectSchema = z.object({
  topic: z.string().describe('Topic or entity to summarize knowledge about'),
  user_id: z.string().optional(),
});

const ListRecentSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
  since_hours: z.number().optional().describe('Only show memories from last N hours'),
  user_id: z.string().optional(),
});

const UpdateSchema = z.object({
  memory_id: z.string(),
  content: z.string().describe('New content for the memory'),
});

export function createMcpServer(manager: MemoryManager): Server {
  const server = new Server(
    { name: 'memord', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {} } }
  );

  // ── Tools ──────────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'remember',
        description: 'Store information in long-term memory. Call this proactively when: (1) the user shares preferences, constraints, or facts about their projects, (2) before context compaction to preserve important context, (3) the user explicitly asks to remember something. Use importance 0.8+ for constraints and explicit requests, 0.5-0.7 for preferences and project facts. The system deduplicates automatically — call remember freely.',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'The information to remember' },
            type: { type: 'string', enum: ['preference', 'project_fact', 'constraint', 'goal', 'episodic', 'skill'] },
            topic: { type: 'string', description: 'Topic category e.g. "tech_stack", "user_bio", "project_name"' },
            importance: { type: 'number', description: '0.0 to 1.0. Use 0.8+ for important facts, 0.3-0.5 for context.' },
            source: { type: 'string', enum: ['claude_compact', 'manual', 'session_end', 'explicit', 'auto_extract', 'ollama_extract'] },
            app: { type: 'string', description: 'Which tool is writing this (e.g. "claude-desktop")' },
            user_id: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
          },
          required: ['content'],
        },
      },
      {
        name: 'recall',
        description: 'Search memory for information relevant to a query. Use at the start of conversations or when the user references past context.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'What to search for' },
            user_id: { type: 'string' },
            types: { type: 'array', items: { type: 'string', enum: ['preference', 'project_fact', 'constraint', 'goal', 'episodic', 'skill'] } },
            limit: { type: 'number', description: 'Max results (default 10)' },
            since: { type: 'string', description: 'ISO date — only recall memories after this date' },
            min_importance: { type: 'number', description: 'Filter by minimum importance score' },
            app: { type: 'string' },
          },
          required: ['query'],
        },
      },
      {
        name: 'forget',
        description: 'Delete a specific memory. Use when the user explicitly says to forget something.',
        inputSchema: {
          type: 'object',
          properties: { memory_id: { type: 'string' } },
          required: ['memory_id'],
        },
      },
      {
        name: 'reflect',
        description: 'Summarize everything known about a topic or entity. Returns a synthesis of related memories.',
        inputSchema: {
          type: 'object',
          properties: {
            topic: { type: 'string' },
            user_id: { type: 'string' },
          },
          required: ['topic'],
        },
      },
      {
        name: 'list_recent',
        description: 'List recently added memories. Useful for reviewing what the assistant knows.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number' },
            since_hours: { type: 'number', description: 'Show memories from last N hours' },
            user_id: { type: 'string' },
          },
        },
      },
      {
        name: 'update_memory',
        description: 'Update the content of an existing memory when new information supersedes old.',
        inputSchema: {
          type: 'object',
          properties: {
            memory_id: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['memory_id', 'content'],
        },
      },
      {
        name: 'extract_from_text',
        description: 'Extract and store memories from a conversation text block. Uses Ollama LLM if available, falls back to regex patterns.',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Conversation text to extract memories from' },
            app: { type: 'string', description: 'Source application name' },
          },
          required: ['text'],
        },
      },
      {
        name: 'ollama_status',
        description: 'Check if Ollama is available and which model is configured for memory extraction.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'remember': {
          const input = RememberSchema.parse(args);
          const result = await manager.remember({
            ...input,
            type: input.type as MemoryType | undefined,
            source: input.source as MemorySource | undefined,
          });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                action: result.action,
                memory_id: result.memory.id,
                topic: result.memory.topic,
                message: result.action === 'skipped'
                  ? 'Memory skipped (importance below threshold)'
                  : result.action === 'updated'
                  ? 'Similar memory updated'
                  : 'Memory stored',
              }),
            }],
          };
        }

        case 'recall': {
          const input = RecallSchema.parse(args);
          const results = await manager.recall({
            ...input,
            types: input.types as MemoryType[] | undefined,
            since: input.since ? new Date(input.since).getTime() : undefined,
          });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                count: results.length,
                memories: results.map(r => ({
                  id: r.memory.id,
                  type: r.memory.type,
                  topic: r.memory.topic,
                  content: r.memory.content,
                  importance: r.memory.importance,
                  app: r.memory.app,
                  score: Math.round(r.score * 1000) / 1000,
                  stored: new Date(r.memory.ingestion_time).toISOString(),
                })),
              }),
            }],
          };
        }

        case 'forget': {
          const { memory_id } = ForgetSchema.parse(args);
          const deleted = manager.forget(memory_id);
          return {
            content: [{ type: 'text', text: JSON.stringify({ deleted, memory_id }) }],
          };
        }

        case 'reflect': {
          const { topic, user_id } = ReflectSchema.parse(args);
          const result = await manager.reflect(topic, user_id);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                topic: result.topic,
                summary: result.summary,
                memory_count: result.memories.length,
                memories: result.memories.map(m => ({ id: m.id, content: m.content, type: m.type, importance: m.importance })),
              }),
            }],
          };
        }

        case 'list_recent': {
          const input = ListRecentSchema.parse(args);
          const memories = manager.listRecent(input);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                count: memories.length,
                memories: memories.map(m => ({
                  id: m.id, type: m.type, topic: m.topic,
                  content: m.content, importance: m.importance, app: m.app,
                  stored: new Date(m.ingestion_time).toISOString(),
                })),
              }),
            }],
          };
        }

        case 'update_memory': {
          const { memory_id, content } = UpdateSchema.parse(args);
          if (!manager['db'].getById(memory_id)) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ updated: false, memory_id, error: 'Memory not found' }) }],
              isError: true,
            };
          }
          // Re-embed and update
          const { embed } = await import('../embeddings/index.js');
          const embedding = await embed(content);
          manager['db'].update(memory_id, { content, last_accessed: Date.now() });
          manager['db'].updateEmbedding(memory_id, embedding);
          return {
            content: [{ type: 'text', text: JSON.stringify({ updated: true, memory_id }) }],
          };
        }

        case 'extract_from_text': {
          const { text, app } = z.object({
            text: z.string(),
            app: z.string().optional(),
          }).parse(args);
          const result = await manager.extractAndRemember(text, { app });
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          };
        }

        case 'ollama_status': {
          const { checkOllama } = await import('../extractor/ollama.js');
          const status = await checkOllama();
          return {
            content: [{ type: 'text', text: JSON.stringify(status) }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  });

  // ── Resources ──────────────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      { uri: 'memory://stats', name: 'Memory Statistics', mimeType: 'application/json', description: 'Memory store stats: counts by type, oldest/newest' },
      { uri: 'memory://recent', name: 'Recent Memories', mimeType: 'application/json', description: 'Last 20 memories for context injection' },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    if (uri === 'memory://stats') {
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(manager.stats()) }] };
    }
    if (uri === 'memory://recent') {
      const memories = manager.listRecent({ limit: 20 });
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(memories) }] };
    }
    throw new Error(`Unknown resource: ${uri}`);
  });

  return server;
}

export async function startMcpStdio(manager: MemoryManager): Promise<void> {
  const server = createMcpServer(manager);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[memord] MCP server running on stdio');
}
