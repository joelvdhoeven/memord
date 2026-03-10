# Design Philosophy

## Memory should be infrastructure

Every AI coding tool today has isolated, incompatible, often cloud-dependent memory.

This is the wrong abstraction.

Memory should be infrastructure — like Git for code, or Docker for environments. Open, local, shared, and composable.

Memord is built on this principle.

## Four principles

### 1. Local-first

Your memories are yours. They live in a SQLite file on your machine (`~/.memord/memories.db`). The embedding model runs locally via ONNX. There are no API calls to store or retrieve memories. No subscription required. No data leaving your laptop.

This is not a limitation. It is the design.

### 2. Tool-agnostic

Memord does not care which AI tool you use today or which you use in a year. MCP (Model Context Protocol) and HTTP mean any tool can integrate without special treatment.

When the ecosystem shifts — new tools, new protocols — Memord adapts. The memory store remains stable.

### 3. Fast retrieval

Memory is only useful if retrieval is accurate and fast. Memord uses a hybrid approach: vector similarity for semantic matching, BM25 for exact keywords, recency decay for freshness. Combined with MMR reranking for diversity.

All of this runs in SQLite + local ONNX. No network round-trips.

### 4. Automatic quality

Deduplication, importance thresholds, and auto-tagging happen automatically. The memory store stays clean without user maintenance.

The goal is zero friction: AI tools call `remember()` freely, and the system handles quality control.

## What Memord is not

- Not a RAG system for documents
- Not a cloud sync service
- Not a chat history tool
- Not a replacement for project documentation

Memord is specifically for **behavioral context**: preferences, constraints, conventions, and facts that AI tools should know about you and your projects.

## Prior art

- **mem0**: cloud-dependent, paid tier, not tool-agnostic
- **MemGPT/Letta**: requires OpenAI API, heavy infrastructure
- **Zep**: cloud-first, enterprise-focused

Memord's differentiation: fully local, zero API keys, shared across tools via open protocols.
