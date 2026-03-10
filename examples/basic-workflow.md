# Basic Workflow Example

A concrete example of how Memord creates shared context across tools.

## Scenario

You are working on a TypeScript project. You use Claude Code in the morning and Cursor in the afternoon.

---

## Step 1 — Claude Code learns a convention

During your Claude Code session, you mention:

> "We always use Zod for validation in this project. Never use Joi or Yup."

Claude Code calls Memord automatically:

```json
// remember() call from Claude Code
{
  "content": "Project convention: always use Zod for runtime validation. Never use Joi or Yup.",
  "type": "constraint",
  "topic": "tech_stack",
  "importance": 0.9,
  "app": "claude-code"
}
```

Memord responds:
```json
{
  "action": "added",
  "memory_id": "550e8400-e29b-41d4-a716-446655440000",
  "topic": "tech_stack",
  "message": "Memory stored"
}
```

---

## Step 2 — Memord stores and indexes it

Internally, Memord:

1. Checks importance (0.9 >= 0.3 threshold)
2. Embeds the content: `embed("passage: Project convention: always use Zod...")`
3. Checks for near-duplicates — none found
4. Inserts into SQLite with FTS5 indexing
5. Auto-tags: `["zod", "validation", "project", "tech_stack"]`

The memory is now in `~/.memord/memories.db`.

---

## Step 3 — Cursor retrieves it

Later, you open Cursor. At session start, Cursor calls:

```json
// recall() call from Cursor
{
  "query": "validation libraries and conventions",
  "limit": 10
}
```

Memord runs hybrid search:
- FTS5 matches on "validation" in content and tags
- Vector search finds semantic similarity
- RRF fusion ranks results
- Constraint type boosts importance score

Cursor receives:

```json
{
  "count": 1,
  "memories": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "constraint",
      "topic": "tech_stack",
      "content": "Project convention: always use Zod for runtime validation. Never use Joi or Yup.",
      "importance": 0.9
    }
  ]
}
```

Cursor now knows to use Zod. You never had to repeat yourself.

---

## Step 4 — Windsurf joins the project

A week later, a colleague starts using Windsurf on the same machine. They call:

```bash
npx memord setup
```

Windsurf is configured. On first session, it recalls memories from the shared store and immediately knows the project conventions.

---

## Terminal Usage

You can also interact with Memord directly:

```bash
# Search from terminal
npx memord search "validation"

# List recent memories
npx memord list

# Check daemon status
npx memord status

# Open dashboard
open http://localhost:7432
```

---

## Next Steps

- [Architecture](../docs/architecture.md) — how the memory engine works
- [Integrations](../docs/integrations.md) — connecting more tools
- [Memory Engine](../docs/memory-engine.md) — hybrid retrieval details
