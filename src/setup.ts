/**
 * `memord setup` — auto-configures all MCP-compatible AI tools
 * to connect to the local memord memory server.
 *
 * Usage: npx memord setup
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';

const HOME = homedir();
const IS_WIN = platform() === 'win32';
const IS_MAC = platform() === 'darwin';
const APPDATA = process.env.APPDATA ?? join(HOME, 'AppData', 'Roaming');
const USERNAME = process.env.USER ?? process.env.USERNAME ?? 'default';

export type SetupStatus = 'configured' | 'already_set' | 'skipped' | 'error';

export interface SetupResult {
  tool: string;
  path: string;
  status: SetupStatus;
  message: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getMemordCommand(): { command: string; args: string[] } {
  const localDist = join(HOME, 'memord', 'dist', 'index.js');
  if (existsSync(localDist)) return { command: 'node', args: [localDist, 'mcp'] };
  return { command: 'npx', args: ['memord', 'mcp'] };
}

// Claude Code on Windows requires cmd /c wrapper to resolve npx correctly
function getMemordCommandForClaudeCode(): { command: string; args: string[] } {
  const base = getMemordCommand();
  if (IS_WIN && base.command === 'npx') {
    return { command: 'cmd', args: ['/c', 'npx', ...base.args.slice(1)] };
  }
  return base;
}

function readJson(path: string): Record<string, unknown> {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return {}; }
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  renameSync(tmp, path);
}

function escapeYaml(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

function escapeToml(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

function readYaml(path: string): string {
  try { return readFileSync(path, 'utf-8'); } catch { return ''; }
}

function writeFile(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  const tmp = path + '.tmp';
  writeFileSync(tmp, content, 'utf-8');
  renameSync(tmp, path);
}

function readToml(path: string): string {
  try { return readFileSync(path, 'utf-8'); } catch { return ''; }
}

function dirExists(path: string): boolean {
  try { return existsSync(path); } catch { return false; }
}

// ── Memory rules — shared instruction text injected into every tool ────────

const MEMORD_RULES = `## Memord Memory Instructions

You have access to the memord MCP server with \`remember\` and \`recall\` tools.

Call \`remember\` automatically — without being asked — when you learn:
- A user preference (coding style, library choices, workflow, naming conventions)
- A project architectural decision or technology choice
- A constraint ("never use X", "always prefer Y")
- A project goal, deadline, or scope decision
- Anything the user explicitly asks to remember

Do NOT call \`remember\` for transient task details or info derivable from the code.

Call \`remember\` silently — no announcement, no permission needed.
Call \`recall\` at the start of each new task to load relevant context first.
`;

function writeRulesFile(rulesPath: string, content: string, tool: string): SetupResult {
  try {
    if (existsSync(rulesPath)) {
      const existing = readFileSync(rulesPath, 'utf-8');
      if (existing.includes('memord') || existing.includes('Memord')) {
        return { tool, path: rulesPath, status: 'already_set', message: 'Memory rules already present' };
      }
      writeFile(rulesPath, existing.trimEnd() + '\n\n' + content);
    } else {
      writeFile(rulesPath, content);
    }
    return { tool, path: rulesPath, status: 'configured', message: 'Memory rules written' };
  } catch (e) {
    return { tool, path: rulesPath, status: 'error', message: String(e) };
  }
}

// Standard mcpServers entry (most tools)
function mcpEntry(cmd: ReturnType<typeof getMemordCommand>) {
  return { command: cmd.command, args: cmd.args, env: { MEMORD_USER: USERNAME } };
}

// ── Standard JSON mcpServers injector ─────────────────────────────────────

function injectMcpServers(
  configPath: string,
  cmd: ReturnType<typeof getMemordCommand>,
  tool: string,
  requiresDirExist = false,
): SetupResult {
  if (requiresDirExist && !dirExists(join(configPath, '..'))) {
    return { tool, path: configPath, status: 'skipped', message: 'Not installed' };
  }
  try {
    const config = readJson(configPath);
    const servers = (config.mcpServers as Record<string, unknown>) ?? {};
    const existing = servers['memord'] as Record<string, unknown> | undefined;
    if (existing) {
      // Upgrade old entries that are missing the 'mcp' subcommand arg
      const existingArgs = existing.args as string[] | undefined;
      const wantedArgs = cmd.args;
      if (JSON.stringify(existingArgs) === JSON.stringify(wantedArgs)) {
        return { tool, path: configPath, status: 'already_set', message: 'Already configured' };
      }
      servers['memord'] = mcpEntry(cmd);
      writeJson(configPath, { ...config, mcpServers: servers });
      return { tool, path: configPath, status: 'configured', message: 'Updated config — restart the tool' };
    }
    servers['memord'] = mcpEntry(cmd);
    writeJson(configPath, { ...config, mcpServers: servers });
    return { tool, path: configPath, status: 'configured', message: 'Configured — restart the tool' };
  } catch (e) {
    return { tool, path: configPath, status: 'error', message: String(e) };
  }
}

// VS Code style: uses `servers` key + requires `type` field
function injectVsCodeServers(
  configPath: string,
  cmd: ReturnType<typeof getMemordCommand>,
  tool: string,
  requiresDirExist = false,
): SetupResult {
  if (requiresDirExist && !dirExists(join(configPath, '..'))) {
    return { tool, path: configPath, status: 'skipped', message: 'Not installed' };
  }
  try {
    const config = readJson(configPath);
    const servers = (config.servers as Record<string, unknown>) ?? {};
    const existing = servers['memord'] as Record<string, unknown> | undefined;
    if (existing) {
      const existingArgs = existing.args as string[] | undefined;
      if (JSON.stringify(existingArgs) === JSON.stringify(cmd.args)) {
        return { tool, path: configPath, status: 'already_set', message: 'Already configured' };
      }
      servers['memord'] = { type: 'stdio', command: cmd.command, args: cmd.args, env: { MEMORD_USER: USERNAME } };
      writeJson(configPath, { ...config, servers });
      return { tool, path: configPath, status: 'configured', message: 'Updated config — restart the tool' };
    }
    servers['memord'] = { type: 'stdio', command: cmd.command, args: cmd.args, env: { MEMORD_USER: USERNAME } };
    writeJson(configPath, { ...config, servers });
    return { tool, path: configPath, status: 'configured', message: 'Configured — restart the tool' };
  } catch (e) {
    return { tool, path: configPath, status: 'error', message: String(e) };
  }
}

// JetBrains style: uses `servers` as array
function injectJetBrainsServers(
  configPath: string,
  cmd: ReturnType<typeof getMemordCommand>,
  tool: string,
): SetupResult {
  if (!dirExists(join(configPath, '..'))) {
    return { tool, path: configPath, status: 'skipped', message: 'Not installed' };
  }
  try {
    const config = readJson(configPath);
    const servers = (config.servers as Array<Record<string, unknown>>) ?? [];
    if (servers.some(s => s.name === 'memord')) {
      return { tool, path: configPath, status: 'already_set', message: 'Already configured' };
    }
    servers.push({ name: 'memord', command: cmd.command, args: cmd.args, env: { MEMORD_USER: USERNAME } });
    writeJson(configPath, { ...config, servers });
    return { tool, path: configPath, status: 'configured', message: 'Configured — restart IDE' };
  } catch (e) {
    return { tool, path: configPath, status: 'error', message: String(e) };
  }
}

// ── Tool configurators ────────────────────────────────────────────────────

function setupClaudeDesktop(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = IS_WIN
    ? join(APPDATA, 'Claude', 'claude_desktop_config.json')
    : IS_MAC
    ? join(HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
    : join(HOME, '.config', 'Claude', 'claude_desktop_config.json');
  return injectMcpServers(path, cmd, 'Claude Desktop');
}

function setupClaudeCode(_cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  // Claude Code user-scope MCP config lives in ~/.claude.json (not ~/.claude/settings.json)
  // On Windows, npx requires a cmd /c wrapper to resolve correctly
  const path = join(HOME, '.claude.json');
  if (!dirExists(join(HOME, '.claude'))) {
    return { tool: 'Claude Code', path, status: 'skipped', message: 'Not installed' };
  }
  return injectMcpServers(path, getMemordCommandForClaudeCode(), 'Claude Code');
}

function setupCursor(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = join(HOME, '.cursor', 'mcp.json');
  // Check common Cursor install locations before writing config
  const cursorInstalled =
    dirExists(join(HOME, '.cursor')) ||
    (IS_WIN && dirExists(join(HOME, 'AppData', 'Local', 'Programs', 'Cursor'))) ||
    (!IS_WIN && !IS_MAC && dirExists('/usr/bin/cursor')) ||
    (IS_MAC && dirExists('/Applications/Cursor.app'));
  if (!cursorInstalled) {
    return { tool: 'Cursor', path, status: 'skipped', message: 'Not installed' };
  }
  return injectMcpServers(path, cmd, 'Cursor');
}

function setupWindsurf(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = join(HOME, '.codeium', 'windsurf', 'mcp_config.json');
  return injectMcpServers(path, cmd, 'Windsurf', true);
}

function setupVsCode(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = IS_WIN
    ? join(APPDATA, 'Code', 'User', 'mcp.json')
    : IS_MAC
    ? join(HOME, 'Library', 'Application Support', 'Code', 'User', 'mcp.json')
    : join(HOME, '.config', 'Code', 'User', 'mcp.json');
  return injectVsCodeServers(path, cmd, 'VS Code', true);
}

function setupVisualStudio(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  if (!IS_WIN) return { tool: 'Visual Studio', path: '', status: 'skipped', message: 'Windows only' };
  // Check both x64 and x86 install directories
  const vsInstalled =
    dirExists('C:\\Program Files\\Microsoft Visual Studio') ||
    dirExists('C:\\Program Files (x86)\\Microsoft Visual Studio');
  const path = join(HOME, '.mcp.json');
  if (!vsInstalled) return { tool: 'Visual Studio', path, status: 'skipped', message: 'Not installed' };
  return injectMcpServers(path, cmd, 'Visual Studio');
}

function setupCline(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const base = IS_WIN ? join(APPDATA, 'Code') : IS_MAC
    ? join(HOME, 'Library', 'Application Support', 'Code')
    : join(HOME, '.config', 'Code');
  const path = join(base, 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json');
  return injectMcpServers(path, cmd, 'Cline', true);
}

function setupRooCode(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const base = IS_WIN ? join(APPDATA, 'Code') : IS_MAC
    ? join(HOME, 'Library', 'Application Support', 'Code')
    : join(HOME, '.config', 'Code');
  const path = join(base, 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'cline_mcp_settings.json');
  return injectMcpServers(path, cmd, 'Roo Code', true);
}

function setupContinue(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const configDir = join(HOME, '.continue');
  if (!dirExists(configDir)) {
    return { tool: 'Continue', path: configDir, status: 'skipped', message: 'Not installed' };
  }
  const yamlPath = join(configDir, 'config.yaml');
  const entry = `\nmcpServers:\n  - name: memord\n    command: ${cmd.command}\n    args:\n${cmd.args.map(a => `      - "${a}"`).join('\n')}\n    env:\n      MEMORD_USER: "${escapeYaml(USERNAME)}"\n`;
  try {
    const existing = readYaml(yamlPath);
    if (existing.includes('memord')) {
      return { tool: 'Continue', path: yamlPath, status: 'already_set', message: 'Already configured' };
    }
    writeFile(yamlPath, existing + entry);
    return { tool: 'Continue', path: yamlPath, status: 'configured', message: 'Configured — restart Continue' };
  } catch (e) {
    return { tool: 'Continue', path: yamlPath, status: 'error', message: String(e) };
  }
}

function setupZed(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = IS_WIN
    ? join(APPDATA, 'Zed', 'settings.json')
    : join(HOME, '.config', 'zed', 'settings.json');
  if (!dirExists(join(path, '..'))) {
    return { tool: 'Zed', path, status: 'skipped', message: 'Not installed' };
  }
  try {
    const config = readJson(path);
    const servers = (config.context_servers as Record<string, unknown>) ?? {};
    if (servers['memord']) return { tool: 'Zed', path, status: 'already_set', message: 'Already configured' };
    servers['memord'] = { source: 'custom', command: cmd.command, args: cmd.args, env: { MEMORD_USER: USERNAME } };
    writeJson(path, { ...config, context_servers: servers });
    return { tool: 'Zed', path, status: 'configured', message: 'Configured — restart Zed' };
  } catch (e) {
    return { tool: 'Zed', path, status: 'error', message: String(e) };
  }
}

function setupJetBrains(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = join(HOME, '.junie', 'mcp', 'mcp.json');
  return injectMcpServers(path, cmd, 'JetBrains IDEs', true);
}

function setupGeminiCli(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = join(HOME, '.gemini', 'settings.json');
  return injectMcpServers(path, cmd, 'Gemini CLI', true);
}

function setupCodexCli(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = join(HOME, '.codex', 'config.toml');
  if (!dirExists(join(HOME, '.codex'))) {
    return { tool: 'OpenAI Codex CLI', path, status: 'skipped', message: 'Not installed' };
  }
  try {
    const existing = readToml(path);
    if (existing.includes('[mcp_servers.memord]')) {
      return { tool: 'OpenAI Codex CLI', path, status: 'already_set', message: 'Already configured' };
    }
    const entry = `\n[mcp_servers.memord]\ncommand = "${cmd.command}"\nargs = [${cmd.args.map(a => `"${a}"`).join(', ')}]\nenabled = true\n\n[mcp_servers.memord.env]\nMEMORD_USER = "${escapeToml(USERNAME)}"\n`;
    writeFile(path, existing + entry);
    return { tool: 'OpenAI Codex CLI', path, status: 'configured', message: 'Configured — restart Codex CLI' };
  } catch (e) {
    return { tool: 'OpenAI Codex CLI', path, status: 'error', message: String(e) };
  }
}

function setupAmazonQ(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = join(HOME, '.aws', 'amazonq', 'mcp.json');
  return injectMcpServers(path, cmd, 'Amazon Q CLI', true);
}

function setupGoose(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const configDir = IS_WIN
    ? join(APPDATA, 'Block', 'goose', 'config')
    : join(HOME, '.config', 'goose');
  const path = join(configDir, 'config.yaml');
  if (!dirExists(configDir)) {
    return { tool: 'Goose', path, status: 'skipped', message: 'Not installed' };
  }
  try {
    const existing = readYaml(path);
    if (existing.includes('memord')) {
      return { tool: 'Goose', path, status: 'already_set', message: 'Already configured' };
    }
    const entry = `\nextensions:\n  memord:\n    name: memord\n    cmd: ${cmd.command}\n    args:\n${cmd.args.map(a => `      - "${a}"`).join('\n')}\n    enabled: true\n    type: stdio\n    envs:\n      MEMORD_USER: "${escapeYaml(USERNAME)}"\n`;
    writeFile(path, existing + entry);
    return { tool: 'Goose', path, status: 'configured', message: 'Configured — restart Goose' };
  } catch (e) {
    return { tool: 'Goose', path, status: 'error', message: String(e) };
  }
}

function setupNeovim(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = join(HOME, '.config', 'mcphub', 'servers.json');
  return injectMcpServers(path, cmd, 'Neovim (mcphub.nvim)', true);
}

function setupWarp(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = IS_MAC
    ? join(HOME, 'Library', 'Group Containers', '2BBY89MBSN.dev.warp', 'Library', 'Application Support', 'dev.warp.Warp-Stable', 'mcp', 'mcp.json')
    : join(HOME, '.config', 'warp', 'mcp.json');
  return injectMcpServers(path, cmd, 'Warp Terminal', true);
}

function setupAugment(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = join(HOME, '.augment', 'settings.json');
  return injectMcpServers(path, cmd, 'Augment Code', true);
}

function setupAntigravity(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = join(HOME, '.gemini', 'antigravity', 'mcp_config.json');
  return injectMcpServers(path, cmd, 'Antigravity', true);
}

function setupAmp(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const base = IS_WIN ? join(APPDATA, 'Code') : IS_MAC
    ? join(HOME, 'Library', 'Application Support', 'Code')
    : join(HOME, '.config', 'Code');
  const path = join(base, 'User', 'settings.json');
  if (!dirExists(join(base, 'User'))) {
    return { tool: 'Amp', path, status: 'skipped', message: 'Not installed' };
  }
  try {
    const config = readJson(path);
    const servers = (config['amp.mcpServers'] as Record<string, unknown>) ?? {};
    const existing = servers['memord'] as Record<string, unknown> | undefined;
    if (existing) {
      const existingArgs = existing.args as string[] | undefined;
      if (JSON.stringify(existingArgs) === JSON.stringify(cmd.args)) {
        return { tool: 'Amp', path, status: 'already_set', message: 'Already configured' };
      }
      servers['memord'] = mcpEntry(cmd);
      writeJson(path, { ...config, 'amp.mcpServers': servers });
      return { tool: 'Amp', path, status: 'configured', message: 'Updated config — restart the tool' };
    }
    servers['memord'] = mcpEntry(cmd);
    writeJson(path, { ...config, 'amp.mcpServers': servers });
    return { tool: 'Amp', path, status: 'configured', message: 'Configured — restart the tool' };
  } catch (e) {
    return { tool: 'Amp', path, status: 'error', message: String(e) };
  }
}

function setup5ire(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = IS_WIN
    ? join(APPDATA, '5ire', 'mcp.json')
    : IS_MAC
    ? join(HOME, 'Library', 'Application Support', '5ire', 'mcp.json')
    : join(HOME, '.config', '5ire', 'mcp.json');
  return injectMcpServers(path, cmd, '5ire', true);
}

function setupLmStudio(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = IS_WIN
    ? join(HOME, '.lmstudio', 'mcp.json')
    : join(HOME, '.lmstudio', 'mcp.json');
  return injectMcpServers(path, cmd, 'LM Studio', true);
}

function setupCherryStudio(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = IS_WIN
    ? join(APPDATA, 'CherryStudio', 'mcp_settings.json')
    : IS_MAC
    ? join(HOME, 'Library', 'Application Support', 'CherryStudio', 'mcp_settings.json')
    : join(HOME, '.config', 'CherryStudio', 'mcp_settings.json');
  return injectMcpServers(path, cmd, 'Cherry Studio', true);
}

function setupGithubCopilot(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = IS_WIN
    ? join(APPDATA, 'Code', 'User', 'mcp.json')
    : IS_MAC
    ? join(HOME, 'Library', 'Application Support', 'Code', 'User', 'mcp.json')
    : join(HOME, '.config', 'Code', 'User', 'mcp.json');
  return injectVsCodeServers(path, cmd, 'GitHub Copilot', true);
}

function setupKiro(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = join(HOME, '.kiro', 'settings', 'mcp.json');
  return injectMcpServers(path, cmd, 'Kiro', true);
}

function setupGeminiCodeAssist(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = join(HOME, '.gemini', 'settings.json');
  return injectMcpServers(path, cmd, 'Gemini Code Assist', true);
}

// ── Rules-file configurators (write memory instruction into each tool) ─────

// Cursor: ~/.cursor/rules/memord.mdc (alwaysApply, MDC format)
function setupCursorRules(): SetupResult | null {
  if (!dirExists(join(HOME, '.cursor'))) return null;
  const content = `---\ndescription: Proactively call remember() to persist context across sessions\nalwaysApply: true\n---\n\n${MEMORD_RULES}`;
  return writeRulesFile(join(HOME, '.cursor', 'rules', 'memord.mdc'), content, 'Cursor (rules)');
}

// Windsurf: ~/.codeium/windsurf/memories/global_rules.md (global, always injected)
function setupWindsurfRules(): SetupResult | null {
  if (!dirExists(join(HOME, '.codeium', 'windsurf'))) return null;
  return writeRulesFile(join(HOME, '.codeium', 'windsurf', 'memories', 'global_rules.md'), MEMORD_RULES, 'Windsurf (global rules)');
}

// Copilot: VS Code User prompts dir — auto-loaded as .instructions.md (applyTo: **)
function setupCopilotRules(): SetupResult | null {
  const base = IS_WIN ? join(APPDATA, 'Code') : IS_MAC
    ? join(HOME, 'Library', 'Application Support', 'Code')
    : join(HOME, '.config', 'Code');
  if (!dirExists(join(base, 'User'))) return null;
  const promptsPath = join(base, 'User', 'prompts', 'memord.instructions.md');
  const content = `---\napplyTo: "**"\n---\n\n${MEMORD_RULES}`;
  return writeRulesFile(promptsPath, content, 'Copilot (instructions)');
}

// Continue: ~/.continue/rules/memord.md (alwaysApply: true)
function setupContinueRules(): SetupResult | null {
  if (!dirExists(join(HOME, '.continue'))) return null;
  const content = `---\nalwaysApply: true\n---\n\n${MEMORD_RULES}`;
  return writeRulesFile(join(HOME, '.continue', 'rules', 'memord.md'), content, 'Continue (rules)');
}

// Cline: ~/Documents/Cline/Rules/memord.md (global, no frontmatter needed)
function setupClineRules(): SetupResult | null {
  const base = IS_WIN ? join(APPDATA, 'Code') : IS_MAC
    ? join(HOME, 'Library', 'Application Support', 'Code')
    : join(HOME, '.config', 'Code');
  if (!dirExists(join(base, 'User', 'globalStorage', 'saoudrizwan.claude-dev'))) return null;
  const rulesDir = IS_WIN || IS_MAC ? join(HOME, 'Documents', 'Cline', 'Rules') : join(HOME, 'Cline', 'Rules');
  return writeRulesFile(join(rulesDir, 'memord.md'), MEMORD_RULES, 'Cline (global rules)');
}

// Kiro: ~/.kiro/steering/memord.md (inclusion: always, global)
function setupKiroRules(): SetupResult | null {
  if (!dirExists(join(HOME, '.kiro'))) return null;
  const content = `---\ninclusion: always\n---\n\n${MEMORD_RULES}`;
  return writeRulesFile(join(HOME, '.kiro', 'steering', 'memord.md'), content, 'Kiro (steering)');
}

// Amp: ~/.config/amp/AGENTS.md (global AGENTS.md, auto-loaded)
function setupAmpRules(): SetupResult | null {
  const ampDir = join(HOME, '.config', 'amp');
  if (!dirExists(ampDir)) return null;
  return writeRulesFile(join(ampDir, 'AGENTS.md'), MEMORD_RULES, 'Amp (AGENTS.md)');
}

// Gemini CLI / Code Assist: ~/.gemini/GEMINI.md (global, auto-loaded)
function setupGeminiRules(): SetupResult | null {
  if (!dirExists(join(HOME, '.gemini'))) return null;
  return writeRulesFile(join(HOME, '.gemini', 'GEMINI.md'), MEMORD_RULES, 'Gemini (GEMINI.md)');
}

// Goose: ~/.config/goose/.goosehints (global, loaded by developer extension)
function setupGooseRules(): SetupResult | null {
  const configDir = IS_WIN
    ? join(APPDATA, 'Block', 'goose', 'config')
    : join(HOME, '.config', 'goose');
  if (!dirExists(configDir)) return null;
  return writeRulesFile(join(configDir, '.goosehints'), MEMORD_RULES, 'Goose (.goosehints)');
}

// JetBrains: .aiassistant/rules/memord.md — per-project, write to home as template
function setupJetBrainsRules(): SetupResult | null {
  if (!dirExists(join(HOME, '.junie'))) return null;
  // Write to ~/.aiassistant/rules/ as a global template users can copy to projects
  return writeRulesFile(join(HOME, '.aiassistant', 'rules', 'memord.md'), MEMORD_RULES, 'JetBrains (rules template)');
}

// ── Main ──────────────────────────────────────────────────────────────────

export function runSetup(): void {
  const cmd = getMemordCommand();

  console.log('\n🧠 memord setup\n');
  console.log(`Command: ${cmd.command} ${cmd.args.join(' ')}\n`);

  // Phase 1 — MCP server config (tells each tool how to connect to memord)
  const mcpConfigurators = [
    setup5ire,
    setupAmazonQ,
    setupAmp,
    setupAntigravity,
    setupAugment,
    setupCherryStudio,
    setupClaudeCode,
    setupClaudeDesktop,
    setupCline,
    setupCodexCli,
    setupContinue,
    setupCursor,
    setupGeminiCli,
    setupGeminiCodeAssist,
    setupGithubCopilot,
    setupGoose,
    setupJetBrains,
    setupKiro,
    setupLmStudio,
    setupNeovim,
    setupRooCode,
    setupVisualStudio,
    setupVsCode,
    setupWarp,
    setupWindsurf,
    setupZed,
  ];

  const mcpResults = mcpConfigurators.map(fn => fn(cmd));

  // Phase 2 — Memory rules (tells each tool's LLM to call remember() proactively)
  const rulesResults: SetupResult[] = [
    setupCursorRules(),
    setupWindsurfRules(),
    setupCopilotRules(),
    setupContinueRules(),
    setupClineRules(),
    setupKiroRules(),
    setupAmpRules(),
    setupGeminiRules(),
    setupGooseRules(),
    setupJetBrainsRules(),
  ].filter((r): r is SetupResult => r !== null);

  const icons: Record<SetupStatus, string> = {
    configured:  '✅',
    already_set: '✓ ',
    skipped:     '—',
    error:       '❌',
  };

  // Print MCP results
  console.log('── MCP configuration ────────────────────────────────');
  const active = mcpResults.filter(r => r.status !== 'skipped');
  const skipped = mcpResults.filter(r => r.status === 'skipped');

  for (const r of active) {
    console.log(`${icons[r.status]} ${r.tool.padEnd(22)} ${r.message}`);
    if (r.status === 'configured' || r.status === 'already_set') {
      console.log(`   ${r.path}`);
    }
  }

  if (skipped.length) {
    console.log(`\n— Not installed (${skipped.length}): ${skipped.map(r => r.tool).join(', ')}`);
  }

  // Print rules results
  if (rulesResults.length > 0) {
    console.log('\n── Memory rules (proactive remember() instructions) ─');
    for (const r of rulesResults) {
      console.log(`${icons[r.status]} ${r.tool.padEnd(22)} ${r.message}`);
      if (r.status === 'configured' || r.status === 'already_set') {
        console.log(`   ${r.path}`);
      }
    }
  }

  // Manual steps for GUI-only tools
  console.log('\n── Manual steps needed for some tools ───────────────');
  console.log('  Zed          — Agent Panel → Rules → create rule → click 📎 for default');
  console.log('  Warp         — Add to AGENTS.md in project root, or Warp Drive → Rules');
  console.log('  5ire         — Create a folder → set System Message on it');
  console.log('  LM Studio    — Save system prompt as a Preset, select it each session');
  console.log('  Cherry Studio — Edit Default Assistant → set system prompt');
  console.log(`\n  Paste this into those tools:\n`);
  console.log('  > Call remember() automatically when you learn user preferences,');
  console.log('  > project decisions, or constraints. Call recall() at session start.');
  console.log('  > Use the memord MCP server. No announcement needed.\n');

  const mcpConfigured = mcpResults.filter(r => r.status === 'configured').length;
  const rulesConfigured = rulesResults.filter(r => r.status === 'configured').length;
  console.log(`${mcpConfigured} MCP config(s) written, ${rulesConfigured} rules file(s) written.\n`);

  if (mcpConfigured > 0 || rulesConfigured > 0) {
    console.log('Restart the configured tools, then ask:');
    console.log('  "What do you know about me?"\n');
  }
}
