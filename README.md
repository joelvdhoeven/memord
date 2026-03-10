# memord

**A local shared memory layer for all your AI tools.**

> Claude learns something → Cursor can recall it. All 100% local. Zero network calls.

---

## What it does

memord is a lightweight daemon that gives your AI tools a shared long-term memory. It runs entirely on your machine — no cloud, no API keys, no Docker.

- **Remember** facts, preferences, project context, and decisions across conversations
- **Recall** relevant memories via semantic + keyword search
- **Share** memory across Claude Desktop, Claude Code, Cursor, Windsurf, and any MCP-compatible tool
- **Auto-extract** memories before context compaction — Claude decides what's worth keeping

Your memories never leave your machine.

---

## Quick start

```bash
npx memord setup
```

That's it. memord auto-configures all your installed AI tools and starts on first use.

---

## How memory extraction works

memord uses **Claude itself** as the extraction layer. Before any context compaction, Claude reads the conversation and decides what's worth remembering — then calls `remember()` directly via MCP. No regex, no external LLM, no Ollama required.

This means:
- Claude understands context, not just pattern-matches text
- Only genuinely useful information gets stored
- Zero extra API calls or background processes

---

## Supported tools

| Tool | Transport | Auto-configured |
|------|-----------|----------------|
| Claude Desktop | MCP stdio | ✓ `npx memord setup` |
| Claude Code | MCP stdio | ✓ `npx memord setup` |
| Cursor | MCP stdio | ✓ `npx memord setup` |
| Windsurf | MCP stdio | ✓ `npx memord setup` |
| VS Code (Copilot) | MCP stdio | ✓ `npx memord setup` |
| Any MCP client | stdio / HTTP | Manual config |

---

## Manual setup

### Claude Desktop

Add to `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "memord": {
      "command": "npx",
      "args": ["memord", "mcp"],
      "env": { "MEMORD_USER": "your-username" }
    }
  }
}
```

### Claude Code

```bash
npx memord setup
```

Or manually add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "memord": {
      "command": "npx",
      "args": ["memord", "mcp"],
      "env": { "MEMORD_USER": "your-username" }
    }
  }
}
```

### Cursor / Windsurf

```json
{
  "mcpServers": {
    "memord": {
      "command": "npx",
      "args": ["memord", "mcp"],
      "env": { "MEMORD_USER": "your-username" }
    }
  }
}
```

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

| Type | Example |
|------|---------|
| `preference` | "Prefers TypeScript over JavaScript" |
| `project_fact` | "Uses Supabase for the backend" |
| `constraint` | "Cannot use paid external APIs" |
| `goal` | "Ship v1 before end of March" |
| `episodic` | "Debugged the embedding pipeline on March 10" |
| `skill` | "Run `npm run build:dashboard` to rebuild the UI" |

---

## Dashboard

memord includes a local web dashboard for browsing, searching, and managing memories:

```bash
npx memord serve
```

Open `http://localhost:7432` in your browser.

---

## Architecture

```
Claude / Cursor / Windsurf
        ↓ MCP (stdio)
   memord daemon
        ↓
   SQLite + FTS5 + vector embeddings
        (~/.memord/memories.db)
```

**Storage:** SQLite + FTS5 (keyword) + float32 embeddings (vector search)
**Embeddings:** `all-MiniLM-L6-v2` via ONNX — 22MB, runs fully offline
**Retrieval:** Hybrid RRF fusion: `0.5×vector + 0.2×BM25 + 0.2×recency + 0.1×importance`
**Extraction:** Claude itself via MCP — no external LLM needed

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

```bash
# Store a memory
curl -X POST http://localhost:7432/memories \
  -H 'Content-Type: application/json' \
  -d '{"content": "User prefers Supabase", "type": "preference", "importance": 0.8}'

# Search memories
curl 'http://localhost:7432/memories/search?q=database+preferences'

# Stats
curl http://localhost:7432/stats
```

---

## License

MIT
