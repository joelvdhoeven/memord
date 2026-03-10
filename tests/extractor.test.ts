import { describe, it, expect } from 'vitest';
import { extractFromText, extractFromMessages, extractFromCompact } from '../src/extractor/index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Find the first extracted memory whose content matches a substring (case-insensitive).
 */
function findByContent(memories: ReturnType<typeof extractFromText>, substr: string) {
  return memories.find(m => m.content.toLowerCase().includes(substr.toLowerCase()));
}

// ── extractFromText ───────────────────────────────────────────────────────────

describe('extractFromText()', () => {
  // ── Explicit "remember that" ────────────────────────────────────────────────

  describe('explicit "remember that" trigger', () => {
    it('extracts a memory from "remember that X" phrasing', () => {
      const text = 'Remember that we are targeting Node 22 for the production environment.';
      const memories = extractFromText(text);

      expect(memories.length).toBeGreaterThan(0);
      const match = findByContent(memories, 'remember that');
      expect(match).toBeDefined();
    });

    it('assigns type project_fact for "remember that" extractions', () => {
      const text = 'Remember that the API rate limit is 1000 requests per minute.';
      const memories = extractFromText(text);
      const match = findByContent(memories, 'remember that');
      expect(match?.type).toBe('project_fact');
    });

    it('assigns high importance (>= 0.85) for "remember that"', () => {
      const text = 'Remember that deployments go through the staging environment first.';
      const memories = extractFromText(text);
      const match = findByContent(memories, 'remember that');
      expect(match?.importance).toBeGreaterThanOrEqual(0.85);
    });

    it('also extracts "note that X" phrasing', () => {
      const text = 'Note that the database migrations must run before the server starts.';
      const memories = extractFromText(text);
      expect(memories.length).toBeGreaterThan(0);
    });

    it('also extracts "keep in mind that X" phrasing', () => {
      const text = 'Keep in mind that the team only reviews PRs on weekdays.';
      const memories = extractFromText(text);
      expect(memories.length).toBeGreaterThan(0);
    });
  });

  // ── Preferences ─────────────────────────────────────────────────────────────

  describe('preference extraction', () => {
    it('extracts a preference from "I prefer TypeScript"', () => {
      const text = 'I prefer TypeScript over JavaScript for all new services.';
      const memories = extractFromText(text);

      expect(memories.length).toBeGreaterThan(0);
      const pref = memories.find(m => m.type === 'preference');
      expect(pref).toBeDefined();
      expect(pref!.content.toLowerCase()).toContain('typescript');
    });

    it('extracts a preference from "I like" phrasing', () => {
      const text = 'I like using Prettier for automatic code formatting in every project.';
      const memories = extractFromText(text);
      const pref = memories.find(m => m.type === 'preference');
      expect(pref).toBeDefined();
    });

    it('extracts a preference from "I hate" / negative preference', () => {
      const text = 'I hate using class components in React and always use functional ones.';
      const memories = extractFromText(text);
      const pref = memories.find(m => m.type === 'preference');
      expect(pref).toBeDefined();
    });

    it('assigns importance around 0.7 for preferences', () => {
      const text = 'I always use ESLint with TypeScript strict mode in my projects.';
      const memories = extractFromText(text);
      const pref = memories.find(m => m.type === 'preference');
      expect(pref?.importance).toBeGreaterThanOrEqual(0.65);
      expect(pref?.importance).toBeLessThanOrEqual(0.8);
    });
  });

  // ── Constraints ──────────────────────────────────────────────────────────────

  describe('constraint extraction', () => {
    it('extracts a constraint from "we cannot use external APIs"', () => {
      const text = 'We cannot use external APIs due to security restrictions from the compliance team.';
      const memories = extractFromText(text);

      const constraint = memories.find(m => m.type === 'constraint');
      expect(constraint).toBeDefined();
      expect(constraint!.content.toLowerCase()).toContain('external');
    });

    it('extracts a constraint from "must not" phrasing', () => {
      const text = 'We must not store personal user data outside the EU data center boundary.';
      const memories = extractFromText(text);
      const constraint = memories.find(m => m.type === 'constraint');
      expect(constraint).toBeDefined();
    });

    it('extracts a constraint from "constraint: ..." phrasing', () => {
      const text = 'Constraint: the system must handle 10,000 concurrent WebSocket connections.';
      const memories = extractFromText(text);
      const constraint = memories.find(m => m.type === 'constraint');
      expect(constraint).toBeDefined();
    });

    it('assigns high importance (>= 0.8) for constraints', () => {
      const text = "We can't use paid third-party services without explicit CFO approval.";
      const memories = extractFromText(text);
      const constraint = memories.find(m => m.type === 'constraint');
      expect(constraint?.importance).toBeGreaterThanOrEqual(0.8);
    });
  });

  // ── Goals ────────────────────────────────────────────────────────────────────

  describe('goal extraction', () => {
    it('extracts a goal from "goal: ship by Friday"', () => {
      const text = 'Goal: ship the MVP by Friday to show the investors a working product.';
      const memories = extractFromText(text);

      const goal = memories.find(m => m.type === 'goal');
      expect(goal).toBeDefined();
      expect(goal!.content.toLowerCase()).toContain('ship');
    });

    it('extracts a goal from "objective:" phrasing', () => {
      const text = 'Objective: reduce page load time to under two seconds for all users.';
      const memories = extractFromText(text);
      const goal = memories.find(m => m.type === 'goal');
      expect(goal).toBeDefined();
    });

    it('extracts a goal from "we want to X" phrasing', () => {
      const text = 'We want to migrate the monolith to microservices by the end of Q2.';
      const memories = extractFromText(text);
      const goal = memories.find(m => m.type === 'goal');
      expect(goal).toBeDefined();
    });

    it('assigns importance around 0.7-0.85 for goals', () => {
      const text = 'Goal: achieve 95% test coverage across all core modules.';
      const memories = extractFromText(text);
      const goal = memories.find(m => m.type === 'goal');
      expect(goal?.importance).toBeGreaterThanOrEqual(0.65);
      expect(goal?.importance).toBeLessThanOrEqual(0.9);
    });
  });

  // ── Noise filtering ──────────────────────────────────────────────────────────

  describe('noise filtering', () => {
    it('returns empty for short noise like "ok"', () => {
      const memories = extractFromText('ok');
      expect(memories).toHaveLength(0);
    });

    it('returns empty for "okay"', () => {
      expect(extractFromText('okay')).toHaveLength(0);
    });

    it('returns empty for "thanks!"', () => {
      expect(extractFromText('thanks!')).toHaveLength(0);
    });

    it('returns empty for "got it"', () => {
      expect(extractFromText('got it')).toHaveLength(0);
    });

    it('returns empty for a very short string (≤10 chars)', () => {
      expect(extractFromText('yes please')).toHaveLength(0);
    });

    it('returns empty for purely conversational filler', () => {
      const text = 'Sure, that sounds good to me.';
      const memories = extractFromText(text);
      expect(memories).toHaveLength(0);
    });

    it('does not extract from assistant-style acknowledgements', () => {
      const text = 'Great! I can help with that.';
      const memories = extractFromText(text);
      expect(memories).toHaveLength(0);
    });
  });

  // ── Source and metadata propagation ─────────────────────────────────────────

  describe('options propagation', () => {
    it('passes source option through to extracted memories', () => {
      const text = 'I prefer using Zod for runtime validation in all TypeScript projects.';
      const memories = extractFromText(text, { source: 'session_end' });
      expect(memories.every(m => m.source === 'session_end')).toBe(true);
    });

    it('uses "auto_extract" as the default source', () => {
      const text = 'I prefer using Zod for runtime validation in all projects always.';
      const memories = extractFromText(text);
      expect(memories.every(m => m.source === 'auto_extract')).toBe(true);
    });

    it('passes app option through to extracted memories', () => {
      const text = 'I prefer Cursor over VS Code for AI-assisted development workflows.';
      const memories = extractFromText(text, { app: 'cursor' });
      expect(memories.every(m => m.app === 'cursor')).toBe(true);
    });

    it('passes user_id option through to extracted memories', () => {
      const text = 'I prefer dark themes like Dracula in all my development environments.';
      const memories = extractFromText(text, { user_id: 'joel' });
      expect(memories.every(m => m.user_id === 'joel')).toBe(true);
    });
  });

  // ── Topic inference ──────────────────────────────────────────────────────────

  describe('topic inference', () => {
    it('infers tech_stack topic when TypeScript is mentioned', () => {
      const text = 'I prefer TypeScript over plain JavaScript for all backend services.';
      const memories = extractFromText(text);
      const match = memories.find(m => m.type === 'preference');
      expect(match?.topic).toBe('tech_stack');
    });

    it('infers data_layer topic when a database is mentioned', () => {
      const text = 'We use Postgres as the primary database for all persistent storage needs.';
      const memories = extractFromText(text);
      expect(memories.length).toBeGreaterThan(0);
      const match = memories[0];
      expect(match.topic).toBe('data_layer');
    });

    it('defaults to "general" for unrecognised topics', () => {
      const text = 'Remember that the meeting room is booked every Tuesday at noon.';
      const memories = extractFromText(text);
      expect(memories.length).toBeGreaterThan(0);
      // No special keyword → general
      expect(memories[0].topic).toBe('general');
    });
  });

  // ── Deduplication within a single text block ─────────────────────────────────

  describe('within-text deduplication', () => {
    it('does not emit the same sentence twice', () => {
      // Repeat the exact same sentence
      const text = [
        'I prefer TypeScript over plain JavaScript for all projects.',
        'I prefer TypeScript over plain JavaScript for all projects.',
      ].join('\n');

      const memories = extractFromText(text);
      const contents = memories.map(m => m.content.toLowerCase().trim());
      const unique = new Set(contents);
      expect(unique.size).toBe(contents.length);
    });
  });
});

// ── extractFromMessages ───────────────────────────────────────────────────────

describe('extractFromMessages()', () => {
  it('only processes user messages, ignores assistant messages', () => {
    const messages = [
      { role: 'user', content: 'I prefer TypeScript and always use strict mode in all projects.' },
      { role: 'assistant', content: 'I prefer Python and use Jupyter notebooks for data science work.' },
    ];

    const memories = extractFromMessages(messages);

    // Should find the user preference
    const pref = memories.find(m => m.type === 'preference');
    expect(pref).toBeDefined();

    // Assistant content should not contribute any "prefer Python" memory
    const pythonPref = memories.find(m => m.content.toLowerCase().includes('python'));
    expect(pythonPref).toBeUndefined();
  });

  it('combines content from multiple user messages', () => {
    const messages = [
      { role: 'user', content: 'I prefer TypeScript for the backend services always.' },
      { role: 'assistant', content: 'Sure, TypeScript is a great choice.' },
      { role: 'user', content: 'We cannot use proprietary third-party services due to licensing requirements.' },
    ];

    const memories = extractFromMessages(messages);

    const pref = memories.find(m => m.type === 'preference');
    const constraint = memories.find(m => m.type === 'constraint');

    expect(pref).toBeDefined();
    expect(constraint).toBeDefined();
  });

  it('returns empty array when no user messages contain memory-worthy content', () => {
    const messages = [
      { role: 'user', content: 'ok' },
      { role: 'assistant', content: 'I prefer using Python for all data science pipelines.' },
    ];

    const memories = extractFromMessages(messages);
    expect(memories).toHaveLength(0);
  });

  it('returns empty array for empty messages array', () => {
    const memories = extractFromMessages([]);
    expect(memories).toHaveLength(0);
  });

  it('passes options through to the underlying extractFromText call', () => {
    const messages = [
      { role: 'user', content: 'I prefer React with TypeScript for all frontend applications.' },
    ];

    const memories = extractFromMessages(messages, { app: 'cursor', user_id: 'joel' });
    expect(memories.every(m => m.app === 'cursor')).toBe(true);
    expect(memories.every(m => m.user_id === 'joel')).toBe(true);
  });
});

// ── extractFromCompact ────────────────────────────────────────────────────────

describe('extractFromCompact()', () => {
  it('marks extracted memories with source="claude_compact"', () => {
    const summary = [
      'The user prefers TypeScript over JavaScript for all services.',
      'We cannot use external APIs due to strict compliance requirements.',
      'Goal: achieve 99.9% uptime for the production environment.',
    ].join(' ');

    const memories = extractFromCompact(summary);

    expect(memories.length).toBeGreaterThan(0);
    expect(memories.every(m => m.source === 'claude_compact')).toBe(true);
  });

  it('ignores noise even in compact summaries', () => {
    const memories = extractFromCompact('ok. yes. sure. got it.');
    expect(memories).toHaveLength(0);
  });

  it('does not allow overriding source via options', () => {
    // extractFromCompact's signature omits the source option — it always forces 'claude_compact'
    const summary = 'I prefer dark mode themes in all development environments always.';
    const memories = extractFromCompact(summary, { app: 'windsurf' });

    expect(memories.every(m => m.source === 'claude_compact')).toBe(true);
    // Other options should still pass through
    expect(memories.every(m => m.app === 'windsurf')).toBe(true);
  });

  it('extracts multiple memory types from a compact summary', () => {
    const summary = [
      'I prefer TypeScript for all new projects and services.',
      'We cannot use paid external APIs due to budget constraints from management.',
      'Goal: ship a working prototype to stakeholders by end of the quarter.',
    ].join(' ');

    const memories = extractFromCompact(summary);
    const types = memories.map(m => m.type);

    expect(types).toContain('preference');
    expect(types).toContain('constraint');
    expect(types).toContain('goal');
  });

  it('passes user_id and app options through to extracted memories', () => {
    const summary = 'I prefer Neovim for editing configuration files and shell scripts always.';
    const memories = extractFromCompact(summary, { user_id: 'joel', app: 'claude-desktop' });

    expect(memories.every(m => m.user_id === 'joel')).toBe(true);
    expect(memories.every(m => m.app === 'claude-desktop')).toBe(true);
  });
});
