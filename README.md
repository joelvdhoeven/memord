# memord

**A local shared memory layer for all your AI tools.**

> Claude learns something → Cursor can recall it. All 100% local. Zero network calls.

---

## What it does

memord is a lightweight daemon that gives your AI tools a shared long-term memory. It runs entirely on your machine — no cloud, no API keys, no Docker.

- **Remember** facts, preferences, project context, and decisions across conversations
- **Recall** relevant memories via semantic + keyword search
- **Share** memory across Claude Desktop, Cursor, Windsurf, and any MCP-compatible tool
- **Extract** memories automatically from conversation summaries and compacts

Your memories never leave your machine.

---

## Quick start

```bash
npx memord
```

That's it. memord starts, downloads a 22MB embedding model on first run, and listens for MCP connections.

---

## Claude Desktop integration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["memord"]
    }
  }
}
```

Restart Claude Desktop. memord is now available to all your conversations.

---

## Cursor / Windsurf integration

Run memord in HTTP mode and point your tools at it:

```bash
npx memord http
```

Then in Cursor's MCP config:

```json
{
  "mcpServers": {
    "memory": {
      "url": "http://localhost:7432/mcp"
    }
  }
}
```

**Killer demo:** Open a conversation in Claude Desktop, discuss your project preferences. Then open Cursor — it already knows your stack, constraints, and goals.

---

## MCP tools

| Tool | What it does |
|------|-------------|
| `remember` | Store a fact, preference, or project detail |
| `recall` | Semantic + keyword search across all memories |
| `forget` | Delete a specific memory by ID |
| `reflect` | Summarize everything known about a topic |
| `list_recent` | Show recently stored memories |
| `update_memory` | Update an existing memory's content |

---

## Memory types

- `preference` — user preferences and opinions ("prefers TypeScript over JavaScript")
- `project_fact` — facts about projects, stack, architecture
- `constraint` — hard rules and requirements ("cannot use external APIs")
- `goal` — objectives and plans
- `episodic` — events and conversations
- `skill` — how-to knowledge and workflows

---

## Architecture

```
Conversation (Claude/Cursor/Windsurf)
          ↓ trigger (compact / session-end / explicit)
   Memory Extractor  [heuristic, no LLM required]
          ↓ quality gate (dedupe + importance threshold)
   memord daemon  [SQLite + vector + keyword search]
          ↓ MCP (stdio) or HTTP
   Claude Desktop ─┐
   Cursor          ├─ shared memory
   Windsurf        ┘
```

**Storage:** SQLite + FTS5 (keyword) + float32 embeddings (vector search)
**Embeddings:** `all-MiniLM-L6-v2` via ONNX — 22MB, runs fully offline
**Retrieval:** Hybrid RRF fusion: `0.5×vector + 0.2×BM25 + 0.2×recency + 0.1×importance`

---

## Privacy

- All data stored in `~/.memord/memories.db`
- Zero network calls after initial model download
- No telemetry, no analytics, no cloud sync
- SQLite file — easy to backup, inspect, or delete

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMORD_PORT` | `7432` | HTTP port |
| `MEMORD_USER` | `default` | Default user ID |
| `MEMORD_IMPORTANCE_THRESHOLD` | `0.3` | Memories below this are dropped |
| `MEMORD_SIMILARITY_THRESHOLD` | `0.08` | Cosine distance below this = duplicate |

---

## HTTP API

When running in `http` or `both` mode:

```bash
# Store a memory
curl -X POST http://localhost:7432/memories \
  -H 'Content-Type: application/json' \
  -d '{"content": "User prefers Supabase for backend storage", "type": "preference", "importance": 0.8}'

# Search memories
curl 'http://localhost:7432/memories/search?q=database+preferences'

# Stats
curl http://localhost:7432/stats
```

---

## License

MIT
