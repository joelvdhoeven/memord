# Refactor Plan: Claude-native Memory Extraction

**Datum:** 2026-03-10
**Status:** Goedgekeurd, klaar voor uitvoering

---

## Bevindingen

### Het kernprobleem met de huidige aanpak

De huidige architectuur gebruikt een `PreCompact` command hook (`compact.js`) die een Node.js script uitvoert. Dat script stuurt de conversatietekst naar de memord HTTP server op `/extract`, die vervolgens via Ollama of regex probeert te bepalen wat relevant is.

Dit is fundamenteel gebrekkig omdat:
- **Regex** kent geen context — matcht letterlijk op patronen, mist impliciete kennis
- **Ollama** is een aparte LLM die niet weet wat er werkelijk belangrijk was in de sessie
- **Beide** zijn blinde extractors: ze verwerken tekst zonder te begrijpen waarvoor Claude het gebruikte

### De betere aanpak: Claude als extractor

Claude Code zelf heeft al alle context. Hij weet:
- Wat de gebruiker heeft gevraagd
- Welke beslissingen zijn genomen
- Wat relevant is voor de toekomst

Door een `CLAUDE.md` instructie toe te voegen, vraag je Claude om vóór compaction de `remember` MCP tool te gebruiken. Claude beslist intelligent wat het onthouden waard is — zonder externe API of Ollama.

**Voordelen:**
| | Oude aanpak (regex/Ollama) | Nieuwe aanpak (Claude zelf) |
|---|---|---|
| Begrip van context | Nul | Volledig |
| API key nodig | Nee | Nee (Claude Code draait al) |
| Ollama vereist | Ja (optioneel) | Nee |
| Kwaliteit memories | Matig | Uitstekend |
| Complexiteit | Hoog (hook + script + extractor) | Laag (één CLAUDE.md regel) |

---

## Wat wordt gewijzigd

### 1. Nieuw bestand: `~/.claude/CLAUDE.md`
Instructie aan Claude Code om:
- Bij sessiestart relevante memories op te halen via `recall`
- Vóór `/compact` alle relevante informatie op te slaan via `remember`
- Bij expliciete "onthoud dat" opdrachten direct `remember` aan te roepen

### 2. `~/.claude/settings.json`
- Verwijder de `PreCompact` hook entry (niet langer nodig)
- `SessionStart` hook blijft (GSD check-update)

### 3. `~/memord/src/hooks/compact.ts`
- Verwijder dit bestand — het script is nu overbodig

### 4. Ollama extractor (`src/extractor/ollama.ts`)
- **Bewaren** als optionele laag voor niet-Claude tools (Cursor, Windsurf, etc.)
- De HTTP `/extract` endpoint blijft bruikbaar voor tools die geen Claude intelligentie hebben
- `extract_from_text` MCP tool blijft voor handmatige extractie via dashboard

### 5. `src/mcp/server.ts`
- Verbeter de `remember` tool beschrijving zodat Claude weet wanneer hij hem proactief moet aanroepen
- Voeg `source: 'claude_compact'` toe als standaard bij compaction

### 6. Rebuild
- `npm run build` in `~/memord` na alle codewijzigingen

---

## Wat NIET wordt gewijzigd

- SQLite database schema — geen breaking changes
- HTTP API server — blijft beschikbaar voor dashboard en andere tools
- Ollama integratie — blijft als fallback voor niet-Claude clients
- Dashboard — geen wijzigingen nodig
- MCP tools `recall`, `forget`, `reflect`, `list_recent` — ongewijzigd

---

## Agent taakverdeling

**Agent A — Config & CLAUDE.md**
- Maak `~/.claude/CLAUDE.md` aan met memory instructies
- Verwijder `PreCompact` uit `~/.claude/settings.json`

**Agent B — Codebase cleanup & build**
- Verwijder `src/hooks/compact.ts`
- Verbeter `remember` tool beschrijving in `src/mcp/server.ts`
- Run `npm run build` en verifieer dat alles compileert
