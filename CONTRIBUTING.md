# Contributing to Memord

Thank you for your interest in contributing.

## Development Setup

```bash
git clone https://github.com/joelvdhoeven/memord
cd memord
npm install
npm run build
```

To run in development mode (watches for changes):

```bash
npm run dev
```

## Running Tests

```bash
npm test
```

## Project Structure

```
src/
  db/          # SQLite client and schema
  embeddings/  # ONNX embedding model (e5-small-v2)
  http/        # Hono HTTP server and dashboard
  mcp/         # MCP stdio server
  memory/      # Core MemoryManager (remember, recall, reflect)
  setup.ts     # CLI tool configurator (npx memord setup)
  index.ts     # Entry point / daemon
docs/          # Documentation
examples/      # Example workflows
```

## Adding a New Tool Integration

Tool integrations live in `src/setup.ts`.

Each integration is a function that writes or patches the tool's MCP config file.

Steps:
1. Find the tool's MCP config file path (check official docs)
2. Determine the config format (JSON, YAML, TOML)
3. Add a `setup<ToolName>()` function following the existing patterns
4. Export it from `setup.ts` and add it to the tool selection prompt

Before opening a PR, open an issue to confirm the config path — these change between versions.

## Pull Requests

- Keep PRs focused. One feature or fix per PR.
- Add a short description of what and why.
- Do not include unrelated refactors.

## Issues

Use GitHub Issues for bug reports and feature requests.

For security vulnerabilities, see [SECURITY.md](./SECURITY.md).
