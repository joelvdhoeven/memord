# Security

## Reporting Vulnerabilities

If you discover a security vulnerability in memord, please report it by opening a [GitHub issue](https://github.com/joelvdhoeven/memord/issues) with the label `security`. For sensitive disclosures, mention in the issue that you'd prefer to discuss privately and we'll follow up.

## Security Model

memord is a **local-only daemon**. It is designed to run on your own machine and never exposed to a network.

- Binds to `127.0.0.1` only
- All data stored locally in `~/.memord/memories.db`
- No cloud sync, no telemetry, no external network calls
- Multiple local AI tools share memory via stdio MCP or the local HTTP API

If you run memord in a container or on a server, you are responsible for ensuring the API is not externally accessible.

## Fixed in v0.1.4

### CORS restricted to localhost origins
**Was:** `Access-Control-Allow-Origin: *` — any webpage could read/write all memories.
**Fix:** CORS now only allows `http://localhost:7432` and `http://127.0.0.1:7432`.

### Path traversal in static file serving
**Was:** Resolved file paths were not validated to stay within `publicDir`.
**Fix:** Resolved path is now checked to be a child of `publicDir` before serving.

### FTS5 query injection
**Was:** User search input passed directly into FTS5 `MATCH` queries.
**Fix:** Input is now escaped and wrapped as a phrase query.

### HTTP input validation
**Was:** HTTP endpoints accepted raw bodies without schema validation.
**Fix:** Zod schemas now validate all request bodies; invalid requests return 400.

### Atomic config writes in setup
**Was:** Config files written directly — a crash mid-write could corrupt them.
**Fix:** Written to a `.tmp` file first, then renamed atomically.

### YAML/TOML injection via USERNAME
**Was:** `USERNAME` env var interpolated directly into YAML/TOML templates.
**Fix:** Special characters are now escaped before interpolation.

### Database file permissions
**Was:** SQLite DB created with default permissions (readable by other local users on Unix).
**Fix:** DB file is now `chmod 0600` on Unix after creation.

### Security headers
**Was:** No security headers on HTTP responses.
**Fix:** `X-Content-Type-Options`, `X-Frame-Options`, and `Content-Security-Policy` added.

### Rate limiting on write endpoints
**Was:** No rate limiting — unbounded local writes possible.
**Fix:** Write endpoints limited to 60 requests/minute.

### Ollama/regex extractor removed
**Was:** External LLM calls via Ollama for memory extraction (potential SSRF).
**Fix:** Extractor layer removed entirely. Claude handles extraction natively via MCP.
