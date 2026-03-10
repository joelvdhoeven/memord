/**
 * `memord setup` — auto-configures all MCP-compatible AI tools
 * to connect to the local memord memory server.
 *
 * Usage: npx memord setup
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
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

function readJson(path: string): Record<string, unknown> {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return {}; }
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function readYaml(path: string): string {
  try { return readFileSync(path, 'utf-8'); } catch { return ''; }
}

function writeFile(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

function readToml(path: string): string {
  try { return readFileSync(path, 'utf-8'); } catch { return ''; }
}

function dirExists(path: string): boolean {
  try { return existsSync(path); } catch { return false; }
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

function setupClaudeCode(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  // Claude Code uses ~/.claude/settings.json
  const path = join(HOME, '.claude', 'settings.json');
  if (!dirExists(join(HOME, '.claude'))) {
    return { tool: 'Claude Code', path, status: 'skipped', message: 'Not installed' };
  }
  return injectMcpServers(path, cmd, 'Claude Code');
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
  return injectVsCodeServers(path, cmd, 'Visual Studio');
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
  const entry = `\nmcpServers:\n  - name: memord\n    command: ${cmd.command}\n    args:\n${cmd.args.map(a => `      - "${a}"`).join('\n')}\n    env:\n      MEMORD_USER: "${USERNAME}"\n`;
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
  // Find any JetBrains config dir
  const jbBase = IS_WIN ? join(APPDATA, 'JetBrains')
    : IS_MAC ? join(HOME, 'Library', 'Application Support', 'JetBrains')
    : join(HOME, '.config', 'JetBrains');

  if (!dirExists(jbBase)) {
    return { tool: 'JetBrains IDEs', path: jbBase, status: 'skipped', message: 'Not installed' };
  }

  // Try all installed JetBrains products
  const { readdirSync } = require('fs') as typeof import('fs');
  let configured = 0;
  let lastPath = '';
  try {
    const products = readdirSync(jbBase).filter(d => existsSync(join(jbBase, d)));
    for (const product of products) {
      const path = join(jbBase, product, 'mcp.json');
      const result = injectJetBrainsServers(path, cmd, product);
      if (result.status === 'configured') { configured++; lastPath = path; }
    }
  } catch {}

  if (configured > 0) return { tool: 'JetBrains IDEs', path: lastPath, status: 'configured', message: `Configured ${configured} IDE(s) — restart JetBrains` };
  return { tool: 'JetBrains IDEs', path: jbBase, status: 'already_set', message: 'Already configured' };
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
    const entry = `\n[mcp_servers.memord]\ncommand = "${cmd.command}"\nargs = [${cmd.args.map(a => `"${a}"`).join(', ')}]\nenabled = true\n\n[mcp_servers.memord.env]\nMEMORD_USER = "${USERNAME}"\n`;
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
  const path = join(HOME, '.config', 'goose', 'config.yaml');
  if (!dirExists(join(HOME, '.config', 'goose'))) {
    return { tool: 'Goose', path, status: 'skipped', message: 'Not installed' };
  }
  try {
    const existing = readYaml(path);
    if (existing.includes('memord')) {
      return { tool: 'Goose', path, status: 'already_set', message: 'Already configured' };
    }
    const entry = `\nextensions:\n  memord:\n    name: memord\n    cmd: ${cmd.command}\n    args:\n${cmd.args.map(a => `      - "${a}"`).join('\n')}\n    enabled: true\n    type: stdio\n    envs:\n      MEMORD_USER: "${USERNAME}"\n`;
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
  if (!IS_MAC) return { tool: 'Warp', path: '', status: 'skipped', message: 'macOS only' };
  const path = join(HOME, 'Library', 'Group Containers', '2BBY89MBSN.dev.warp', 'Library', 'Application Support', 'dev.warp.Warp-Stable', 'mcp', 'mcp.json');
  return injectMcpServers(path, cmd, 'Warp Terminal', true);
}

function setupAugment(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const path = join(HOME, '.augment', 'settings.json');
  return injectMcpServers(path, cmd, 'Augment Code', true);
}

// ── Main ──────────────────────────────────────────────────────────────────

export function runSetup(): void {
  const cmd = getMemordCommand();

  console.log('\n🧠 memord setup\n');
  console.log(`Command: ${cmd.command} ${cmd.args.join(' ')}\n`);

  const configurators = [
    setupClaudeDesktop,
    setupClaudeCode,
    setupCursor,
    setupWindsurf,
    setupVsCode,
    setupVisualStudio,
    setupCline,
    setupRooCode,
    setupContinue,
    setupZed,
    setupJetBrains,
    setupGeminiCli,
    setupCodexCli,
    setupAmazonQ,
    setupGoose,
    setupNeovim,
    setupWarp,
    setupAugment,
  ];

  const results = configurators.map(fn => fn(cmd));

  const icons: Record<SetupStatus, string> = {
    configured:  '✅',
    already_set: '✓ ',
    skipped:     '—',
    error:       '❌',
  };

  const active = results.filter(r => r.status !== 'skipped');
  const skipped = results.filter(r => r.status === 'skipped');

  for (const r of active) {
    console.log(`${icons[r.status]} ${r.tool.padEnd(20)} ${r.message}`);
    if (r.status === 'configured' || r.status === 'already_set') {
      console.log(`   ${r.path}`);
    }
  }

  if (skipped.length) {
    console.log(`\n— Not installed (${skipped.length}): ${skipped.map(r => r.tool).join(', ')}`);
  }

  const configured = results.filter(r => r.status === 'configured').length;
  console.log(`\n${configured} tool(s) newly configured.\n`);

  if (configured > 0) {
    console.log('Restart the configured tools, then ask:');
    console.log('  "What do you know about me?"\n');
  }
}
