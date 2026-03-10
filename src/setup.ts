/**
 * `memord setup` — auto-configures Claude Desktop, Claude Code, and Cursor
 * to use memord as an MCP server.
 *
 * Usage: npx memord setup
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import { execSync } from 'child_process';

const HOME = homedir();
const IS_WIN = platform() === 'win32';
const IS_MAC = platform() === 'darwin';

// Detect how memord is being run (local dist vs npx)
function getMemordCommand(): { command: string; args: string[] } {
  // Check if running from a local install
  const localDist = join(HOME, 'memord', 'dist', 'index.js');
  if (existsSync(localDist)) {
    return { command: 'node', args: [localDist] };
  }
  return { command: 'npx', args: ['memord'] };
}

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

function injectMcpServer(config: Record<string, unknown>, cmd: ReturnType<typeof getMemordCommand>): Record<string, unknown> {
  const mcpServers = (config.mcpServers as Record<string, unknown>) ?? {};
  mcpServers['memord'] = {
    command: cmd.command,
    args: cmd.args,
    env: { MEMORD_USER: process.env.USER ?? process.env.USERNAME ?? 'default' },
  };
  return { ...config, mcpServers };
}

interface SetupResult {
  tool: string;
  path: string;
  status: 'configured' | 'already_set' | 'not_found' | 'error';
  message: string;
}

function setupClaudeDesktop(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const paths = IS_WIN
    ? [join(process.env.APPDATA ?? '', 'Claude', 'claude_desktop_config.json')]
    : IS_MAC
    ? [join(HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')]
    : [join(HOME, '.config', 'claude', 'claude_desktop_config.json')];

  const configPath = paths.find(p => existsSync(join(p, '..'))) ?? paths[0];

  try {
    const config = readJson(configPath);
    const existing = (config.mcpServers as Record<string, unknown>)?.['memord'];
    if (existing) {
      return { tool: 'Claude Desktop', path: configPath, status: 'already_set', message: 'Already configured' };
    }
    writeJson(configPath, injectMcpServer(config, cmd));
    return { tool: 'Claude Desktop', path: configPath, status: 'configured', message: 'Added — restart Claude Desktop' };
  } catch (e) {
    return { tool: 'Claude Desktop', path: configPath, status: 'error', message: String(e) };
  }
}

function setupClaudeCode(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const configPath = join(HOME, '.claude', 'settings.json');

  try {
    const config = readJson(configPath);
    const existing = (config.mcpServers as Record<string, unknown>)?.['memord'];
    if (existing) {
      return { tool: 'Claude Code', path: configPath, status: 'already_set', message: 'Already configured' };
    }
    writeJson(configPath, injectMcpServer(config, cmd));
    return { tool: 'Claude Code', path: configPath, status: 'configured', message: 'Added — restart Claude Code' };
  } catch (e) {
    return { tool: 'Claude Code', path: configPath, status: 'error', message: String(e) };
  }
}

function setupCursor(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const paths = IS_WIN
    ? [join(process.env.APPDATA ?? '', 'Cursor', 'User', 'globalStorage', 'cursor.mcp', 'mcp.json')]
    : IS_MAC
    ? [join(HOME, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'cursor.mcp', 'mcp.json')]
    : [join(HOME, '.config', 'Cursor', 'User', 'globalStorage', 'cursor.mcp', 'mcp.json')];

  // Also try ~/.cursor/mcp.json (newer Cursor versions)
  const altPath = join(HOME, '.cursor', 'mcp.json');
  const configPath = existsSync(altPath) ? altPath : (existsSync(paths[0]) ? paths[0] : altPath);

  try {
    const config = readJson(configPath);
    const existing = (config.mcpServers as Record<string, unknown>)?.['memord'];
    if (existing) {
      return { tool: 'Cursor', path: configPath, status: 'already_set', message: 'Already configured' };
    }
    writeJson(configPath, injectMcpServer(config, cmd));
    return { tool: 'Cursor', path: configPath, status: 'configured', message: 'Added — restart Cursor' };
  } catch (e) {
    return { tool: 'Cursor', path: configPath, status: 'error', message: String(e) };
  }
}

function setupWindsurf(cmd: ReturnType<typeof getMemordCommand>): SetupResult {
  const paths = IS_WIN
    ? [join(process.env.APPDATA ?? '', 'Windsurf', 'User', 'globalStorage', 'windsurf.mcp', 'mcp.json')]
    : IS_MAC
    ? [join(HOME, 'Library', 'Application Support', 'Windsurf', 'User', 'globalStorage', 'windsurf.mcp', 'mcp.json')]
    : [join(HOME, '.config', 'Windsurf', 'User', 'globalStorage', 'windsurf.mcp', 'mcp.json')];

  const altPath = join(HOME, '.windsurf', 'mcp.json');
  const configPath = existsSync(altPath) ? altPath : (existsSync(paths[0]) ? paths[0] : altPath);

  try {
    const config = readJson(configPath);
    const existing = (config.mcpServers as Record<string, unknown>)?.['memord'];
    if (existing) {
      return { tool: 'Windsurf', path: configPath, status: 'already_set', message: 'Already configured' };
    }
    writeJson(configPath, injectMcpServer(config, cmd));
    return { tool: 'Windsurf', path: configPath, status: 'configured', message: 'Added — restart Windsurf' };
  } catch (e) {
    return { tool: 'Windsurf', path: configPath, status: 'error', message: String(e) };
  }
}

export function runSetup(): void {
  const cmd = getMemordCommand();

  console.log('\n🧠 memord setup\n');
  console.log(`Connecting to: ${cmd.command} ${cmd.args.join(' ')}\n`);

  const results = [
    setupClaudeDesktop(cmd),
    setupClaudeCode(cmd),
    setupCursor(cmd),
    setupWindsurf(cmd),
  ];

  const icons: Record<string, string> = {
    configured: '✅',
    already_set: '✓ ',
    not_found:   '—',
    error:       '❌',
  };

  for (const r of results) {
    console.log(`${icons[r.status]} ${r.tool.padEnd(16)} ${r.message}`);
    if (r.status === 'configured' || r.status === 'already_set') {
      console.log(`   ${r.path}`);
    }
  }

  const configured = results.filter(r => r.status === 'configured').length;
  console.log(`\n${configured} tool(s) newly configured.`);

  if (configured > 0) {
    console.log('\nNext: restart the configured tools, then try:');
    console.log('  recall("what do you know about me?")\n');
  } else {
    console.log('\nAll tools already connected or not installed.\n');
  }
}
