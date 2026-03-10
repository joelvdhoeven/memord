# Integrations

How to integrate AI tools with Memord.

## Automatic Setup

Run `npx memord setup` and follow the prompts. Memord auto-detects installed tools and writes the correct config.

Supported tools and their config locations:

| Tool | Config File |
|------|------------|
| Claude Code | `~/.claude.json` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) |
| Cursor | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| VS Code (Copilot) | OS-specific user settings `mcp.json` |
| GitHub Copilot | OS-specific user settings `mcp.json` |
| JetBrains IDEs | `~/.junie/mcp/mcp.json` |
| Zed | `~/.config/zed/settings.json` |
| Warp Terminal | `~/.config/warp/mcp.json` |
| Continue | `~/.continue/config.yaml` |
| Cline | VS Code globalStorage settings |
| Roo Code | VS Code globalStorage settings |
| Amp | VS Code user `settings.json` |
| Augment Code | `~/.augment/settings.json` |
| 5ire | OS-specific `5ire/mcp.json` |
| LM Studio | `~/.lmstudio/mcp.json` |
| Cherry Studio | OS-specific `CherryStudio/mcp_settings.json` |
| Kiro | `~/.kiro/settings/mcp.json` |
| Gemini CLI | `~/.gemini/settings.json` |
| Gemini Code Assist | `~/.gemini/settings.json` |
| OpenAI Codex CLI | `~/.codex/config.toml` |
| Amazon Q CLI | `~/.aws/amazonq/mcp.json` |
| Visual Studio | `~/.mcp.json` (Windows only) |
| Neovim (mcphub.nvim) | `~/.config/mcphub/servers.json` |
| Goose | `~/.config/goose/config.yaml` |

## Manual Setup (MCP)

Add to your tool's MCP config:

```json
{
  "mcpServers": {
    "memord": {
      "command": "npx",
      "args": ["memord", "mcp"]
    }
  }
}
```

On Windows (Claude Code):
```json
{
  "mcpServers": {
    "memord": {
      "command": "cmd",
      "args": ["/c", "npx", "memord", "mcp"]
    }
  }
}
```

## HTTP API

For tools that don't support MCP, use the HTTP API at `http://localhost:7432`.

### Store a memory
```bash
curl -X POST http://localhost:7432/memories \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Always use Zod for validation",
    "type": "constraint",
    "importance": 0.9,
    "app": "my-tool"
  }'
```

### Search memories
```bash
curl "http://localhost:7432/memories/search?q=validation+library"
```

### List recent
```bash
curl "http://localhost:7432/memories?limit=10"
```

### Full API reference

| Method | Path | Description |
|--------|------|-------------|
| POST | /memories | Store a memory |
| GET | /memories/search | Hybrid search |
| GET | /memories | List recent |
| GET | /memories/:id | Get by ID |
| DELETE | /memories/:id | Delete |
| GET | /reflect | Reflect on a topic |
| GET | /stats | Memory statistics |
| GET | / | Dashboard |
| GET | /health | Health check |

## Building a Custom Integration

To integrate a tool that supports MCP:

1. Configure it to run `npx memord mcp` as an MCP stdio server
2. The server exposes these tools: `remember`, `recall`, `forget`, `reflect`, `list_recent`, `update_memory`
3. Prompt the tool to call `recall` at session start and `remember` for important context

To integrate via HTTP:

1. Start Memord: `npx memord start`
2. POST to `http://localhost:7432/memories` to store
3. GET `http://localhost:7432/memories/search?q=<query>` to retrieve

## Contributing an Integration

See [CONTRIBUTING.md](../CONTRIBUTING.md) for how to add a new tool to `npx memord setup`.
