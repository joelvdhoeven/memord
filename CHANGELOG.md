# Changelog

All notable changes to memord are documented here.

---

## [0.2.3] — 2026-03-11

### Fixed
- Add `repository`, `homepage`, and `bugs` fields to `package.json` — required for npm sigstore provenance (fixes E422 publish error)
- Remove `tests/ollama.test.ts` and `tests/extractor.test.ts` — referenced deleted extractor modules, causing CI failures

---

## [0.2.2] — 2026-03-11

### Fixed
- Minor packaging fix (re-publish after CI failure)

---

## [0.2.1] — 2026-03-11

### Added — Tool Rules Injection (Phase 2 Setup)
- `npx memord setup` now writes memory instruction files for 10+ tools automatically:
  - **Cursor** — `.cursor/rules/memord.mdc` with MDC frontmatter
  - **Windsurf** — global `global_rules.md` injection
  - **GitHub Copilot** — `.github/copilot-instructions.md`
  - **Continue** — `config.yaml` system prompt injection
  - **Cline/Roo Code** — `.clinerules` / `.roorules`
  - **Kiro** — `.kiro/steering/memord.md` with YAML frontmatter
  - **Amp** — `AGENTS.md` injection
  - **Gemini CLI** — `GEMINI.md` injection
  - **Goose** — `.goosehints` injection
  - **JetBrains AI** — custom rules directory
- For GUI-only tools (Zed, Warp, LM Studio, etc.), setup prints copy-paste instructions

---

## [0.2.0] — 2026-03-11

### Added — Retrieval & Embedding Improvements

#### Embedding model upgrade
- Switched from `all-MiniLM-L6-v2` to `e5-small-v2` (Xenova/e5-small-v2, 33MB, 384-dim)
- Same model size, significantly higher retrieval accuracy using E5 instruction format (`query:` / `passage:` prefixes)

#### True ONNX batching
- `embedBatch()` now runs a single matrix forward pass instead of sequential `Promise.all` — faster ingestion

#### Context-aware deduplication
- `dist < 0.05` → always update (near-identical content)
- `dist < 0.15` + same type + same topic → update (related content refinement)
- Otherwise → add new memory (preserves nuance)

#### Multi-topic tagging
- `inferAllTopics()` assigns up to 3 topic tags per memory
- Extra topics stored in `tags[]` for richer search surface

#### Semantic keyword extraction
- `extractKeywords()` uses TECH_NAMES + STOP_WORDS dictionaries for better BM25 surface

#### Constraint boost
- Memories with `type: 'constraint'` get `importance` floored at 0.8 in scoring — constraints are never buried

#### Compact MCP output
- `recall` response no longer includes `app`, `score`, `stored` fields — ~35% fewer tokens per recall call
- `memory://recent` resource now returns prose bullets instead of JSON — ~50% fewer tokens for context injection

### Security
- Hardened CORS to localhost-only
- Added path traversal protection
- FTS5 query sanitization
- Input length validation
- Atomic file writes (`.tmp` + rename)
- Removed Ollama extractor (SSRF risk)
- DB file permissions (600)
- Security headers on HTTP API
- Rate limiting on write endpoints

---

## [0.1.2] — 2026-03-10

### Added
- Support for 26 AI tools in `npx memord setup`
- HTTP API with `/remember`, `/recall`, `/forget`, `/stats` endpoints
- Optional web dashboard at `http://localhost:7432`
- MCP resources: `memory://stats` and `memory://recent`

---

## [0.1.1] — 2026-03-10

### Fixed
- Windows path handling for MCP config detection
- JetBrains, Gemini Code Assist, Goose, Warp config paths corrected

---

## [0.1.0] — 2026-03-10

### Initial Release
- SQLite + FTS5 + sqlite-vec storage
- Hybrid retrieval: 0.5×vector + 0.2×BM25 + 0.2×recency + 0.1×importance
- MMR reranking to reduce redundancy
- MCP server (stdio transport) with `remember`, `recall`, `forget`, `reflect`, `list_recent`, `update_memory` tools
- `npx memord setup` for one-command MCP configuration
- Local-first: no API keys, no cloud, ONNX embeddings run on-device
