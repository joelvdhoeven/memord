# Memord

**Local shared memory for your AI coding tools.**

Claude learns something. Cursor remembers it. Copilot picks it up.
All locally. No cloud. No vendor lock-in.

[![npm version](https://img.shields.io/npm/v/memord.svg)](https://www.npmjs.com/package/memord)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/joelvdhoeven/memord/pulls)
[![npm downloads](https://img.shields.io/npm/dm/memord.svg)](https://www.npmjs.com/package/memord)

---

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Quick Demo](#quick-demo)
- [Features](#features)
- [Supported Tools](#supported-tools)
- [Example Workflow](#example-workflow)
- [Why Memord Exists](#why-memord-exists)
- [Design Principles](#design-principles)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## The Problem

Every AI coding tool starts from zero.

You explain your architecture to Claude. Then you explain it again to Cursor. Then again to Copilot.

- Your tech stack preferences? Forgotten.
- Your project conventions? Gone after the session.
- Your constraints ("never use class components", "always use Zod for validation")? You repeat them every time.

Each tool operates in complete isolation. There is no shared context layer. No memory infrastructure.

**Developers lose hours every week re-explaining the same things to different AI tools.**

---

## The Solution

Memord is a **local shared memory layer** that sits between your AI tools.

When one tool learns something about you or your project, it stores it in Memord. When another tool needs context, it queries Memord and gets relevant memories back — instantly, locally.

One store. All tools. Persistent context.

---

## Architecture

```
                    ┌─────────────┐
                    │  Claude Code │
                    └──────┬──────┘
                           │ remember()
                           ▼
┌──────────┐        ┌─────────────┐        ┌───────────┐
│  Cursor  │◄──────►│   Memord    │◄──────►│ Windsurf  │
└──────────┘ recall()│  (local DB) │recall()└───────────┘
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │   Copilot   │
                    └─────────────┘
```

Memord runs as a local daemon exposing two interfaces:
- **MCP (stdio)** — for Claude Code, Cursor, Windsurf, and any MCP-compatible tool
- **HTTP API** — for tools that use REST (Copilot, custom integrations)

Data stays on your machine. Always.

---

## Quick Start

```bash
npx memord setup
```

That's it. The CLI auto-detects which AI tools you have installed and configures them in one step.

Restart your AI tools and Memord is active.

---

## Quick Demo

```bash
# Check that Memord is running
npx memord status

# Search your memory store from the terminal
npx memord search "typescript preferences"

# View recent memories
npx memord list
```

Or just use your AI tool — it will call `remember()` and `recall()` automatically via MCP.

---

## Features

- **Shared memory across tools** — Claude, Cursor, Copilot, Windsurf, and more share one local store
- **Hybrid retrieval** — combines vector similarity (e5-small-v2) + BM25 keyword search + recency decay for accurate recall
- **Semantic deduplication** — automatically merges near-identical memories, no duplicates
- **Auto-tagging** — extracts semantic keywords and topics at store time for better FTS recall
- **Constraint boosting** — "never do X" type memories always rank higher in retrieval
- **Local-first** — SQLite + ONNX embeddings, no API keys, no cloud
- **Fast** — sub-10ms queries on commodity hardware
- **MCP + HTTP** — works with any tool via Model Context Protocol or REST
- **Optional dashboard** — browse your memory store at `http://localhost:7432`
- **26+ tool integrations** — one setup command configures all your tools

---

## Supported Tools

| Tool | Protocol | Status |
|------|----------|--------|
| Claude Code | MCP (stdio) | ✅ |
| Claude Desktop | MCP (stdio) | ✅ |
| Cursor | MCP (stdio) | ✅ |
| Windsurf | MCP (stdio) | ✅ |
| VS Code (Copilot) | MCP (stdio) | ✅ |
| JetBrains IDEs | MCP (stdio) | ✅ |
| Zed | MCP (stdio) | ✅ |
| Warp Terminal | MCP (stdio) | ✅ |
| Continue | MCP (stdio) | ✅ |
| Cline | MCP (stdio) | ✅ |
| Roo Code | MCP (stdio) | ✅ |
| 5ire | MCP (stdio) | ✅ |
| LM Studio | MCP (stdio) | ✅ |
| Cherry Studio | MCP (stdio) | ✅ |
| Kiro | MCP (stdio) | ✅ |
| Amp | MCP (stdio) | ✅ |
| Augment Code | MCP (stdio) | ✅ |
| Gemini CLI | MCP (stdio) | ✅ |
| Gemini Code Assist | MCP (stdio) | ✅ |
| OpenAI Codex CLI | MCP (stdio) | ✅ |
| Amazon Q CLI | MCP (stdio) | ✅ |
| Visual Studio | MCP (stdio) | ✅ |
| Neovim (mcphub.nvim) | MCP (stdio) | ✅ |
| Goose | MCP (stdio) | ✅ |
| GitHub Copilot | MCP (stdio) | ✅ |
| Any MCP tool | MCP (stdio/http) | ✅ |

---

## Example Workflow

**1. Claude Code learns a convention**

During your session, Claude notices you always use Zod for validation. It stores this automatically:

```
remember({
  content: "Always use Zod for runtime validation. Never use joi or yup.",
  type: "constraint",
  importance: 0.9
})
```

**2. Memord stores and indexes it**

The memory is embedded (vector), tagged, and indexed for FTS. It's stored in `~/.memord/memories.db`.

**3. Cursor retrieves it the next day**

When you open Cursor on the same project, it queries Memord at session start:

```
recall({ query: "validation library preferences", limit: 5 })
```

Memord returns the Zod constraint. Cursor now knows — without you saying anything.

---

## Why Memord Exists

> AI tools should not have isolated memory. Memory should be infrastructure.

Like Git is infrastructure for code, and Docker is infrastructure for environments — Memord is infrastructure for AI memory.

Right now, every AI tool reinvents the wheel. They have private, incompatible, cloud-dependent memory systems. Or none at all.

Memord takes a different approach:
- **Open** — any tool can integrate via MCP or HTTP
- **Local** — your data never leaves your machine
- **Shared** — one store, all tools, persistent context

This is what a memory layer for the AI-native development stack should look like.

---

## Design Principles

**Local-first**
Your memories are yours. Everything runs on your machine. No API keys, no subscriptions, no data leaving your laptop.

**Tool-agnostic**
Memord does not care which AI tool you use. MCP and HTTP mean any tool can integrate in minutes.

**Fast retrieval**
Hybrid search (vector + BM25 + recency) with MMR reranking. Sub-10ms on SQLite. No round-trips to external services.

**Privacy-first**
SQLite file with `chmod 600`. Localhost-only HTTP. No telemetry. No analytics.

**Automatic quality**
Semantic deduplication, importance thresholds, and auto-tagging keep the memory store clean without user maintenance.

---

## Roadmap

- [ ] Team memory — share a memory store across a dev team via a self-hosted sync layer
- [ ] Memory compression — periodically cluster and summarize old episodic memories
- [ ] Plugin API — standardized SDK for tool integrations
- [ ] Web UI improvements — visual memory graph, manual editing
- [ ] Named entity extraction — index people, projects, technologies as first-class entities
- [ ] Multi-user support — per-user isolation within a shared daemon
- [ ] VS Code extension — native GUI for browsing and managing memories

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to get started.

The most valuable contributions right now:
- New tool integrations (open an issue first)
- Retrieval quality improvements
- Dashboard improvements

---

## License

MIT © [Joel van den Hoeven](https://github.com/joelvdhoeven)

See [LICENSE](./LICENSE).
