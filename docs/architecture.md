# Architecture

Memord is a local daemon that exposes two interfaces for AI tools to read and write shared memory.

## Overview

```
AI Tool (Claude Code, Cursor, etc.)
        │
        │  MCP (stdio) or HTTP (localhost)
        ▼
┌──────────────────────────────────────┐
│              Memord Daemon            │
│                                      │
│  ┌──────────┐    ┌─────────────────┐ │
│  │ MCP      │    │ HTTP API        │ │
│  │ Server   │    │ (Hono, :7432)   │ │
│  └────┬─────┘    └────────┬────────┘ │
│       │                   │          │
│       └──────────┬────────┘          │
│                  ▼                   │
│         ┌────────────────┐           │
│         │ MemoryManager  │           │
│         │                │           │
│         │ remember()     │           │
│         │ recall()       │           │
│         │ reflect()      │           │
│         └───────┬────────┘           │
│                 │                    │
│       ┌─────────┴──────────┐         │
│       │                    │         │
│  ┌────▼─────┐    ┌─────────▼──────┐  │
│  │ DbClient │    │  Embeddings    │  │
│  │ SQLite   │    │  e5-small-v2   │  │
│  │ + FTS5   │    │  ONNX local    │  │
│  └──────────┘    └────────────────┘  │
└──────────────────────────────────────┘
        │
        ▼
~/.memord/memories.db   (SQLite file, chmod 600)
~/.memord/models/       (ONNX model cache)
```

## Components

### MCP Server (`src/mcp/server.ts`)
Exposes 6 tools via the Model Context Protocol (stdio transport):
- `remember` — store a new memory
- `recall` — hybrid search
- `forget` — delete a memory by ID
- `reflect` — synthesize knowledge about a topic
- `list_recent` — list latest memories
- `update_memory` — update content + re-embed

Also exposes 2 MCP resources:
- `memory://stats` — counts and timestamps
- `memory://recent` — last 20 memories as prose bullets

### HTTP Server (`src/http/server.ts`)
REST API on `localhost:7432`. Mirrors MCP tools as HTTP endpoints:
- `POST /memories` — remember
- `GET /memories/search?q=` — recall
- `GET /memories` — list recent
- `DELETE /memories/:id` — forget
- `GET /reflect?topic=` — reflect
- `GET /stats` — statistics

Secured: localhost-only CORS, rate limiting (60 req/min), input validation via Zod.

### MemoryManager (`src/memory/manager.ts`)
Core logic:
- Quality gate: drops memories below importance threshold (0.3)
- Semantic dedup: context-aware thresholds (dist < 0.05 always update, dist < 0.15 + same type/topic update)
- Hybrid retrieval: RRF fusion of FTS5 BM25 + vector cosine
- Final scoring: `0.7 × RRF + 0.2 × recency + 0.1 × importance` (constraints floor-boosted to 0.8)
- MMR reranking: diversity via Maximal Marginal Relevance (λ=0.7)

### DbClient (`src/db/client.ts`)
SQLite via `better-sqlite3`. Schema:
- `memories` table — all fields including BLOB embedding column
- `memories_fts` virtual table (FTS5) — indexed on content, topic, tags
- Triggers keep FTS index in sync with inserts/updates/deletes

### Embeddings (`src/embeddings/index.ts`)
- Model: `Xenova/e5-small-v2` (384-dim, ~33MB ONNX quantized)
- E5 instruction format: `"passage: <text>"` for storage, `"query: <text>"` for search
- True ONNX matrix batching for bulk operations
- Cached in `~/.memord/models/`

## Data Flow — remember()

```
1. input.content → importance check (drop if < 0.3)
2. embed(content, 'passage') → 384-dim Float32Array
3. getTopCandidates(500) → compare cosine distance
4. dist < 0.05 OR (dist < 0.15 AND sameType AND sameTopic) → update existing
5. else → buildMemory() → insert into SQLite + FTS5 + embedding BLOB
```

## Data Flow — recall()

```
1. embed(query, 'query') → 384-dim query vector
2. FTS5 BM25 search → top 20 phrase matches
3. getTopCandidates(500) → cosine rank → top 20 vector matches
4. Merge FTS hits outside top-500 into vector pool
5. RRF fusion of FTS rank + vector rank
6. Final score = 0.7×RRF + 0.2×recency + 0.1×importance
7. Filter by type / min_importance / since / app
8. MMR rerank for diversity
9. Touch access timestamps
10. Return top-N results
```
