/**
 * Minimal localhost dashboard — served at http://localhost:7432/
 * Pure HTML/CSS/JS, no build step, no framework.
 */

export const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>memord</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f0f0f;
      --surface: #1a1a1a;
      --border: #2a2a2a;
      --text: #e8e8e8;
      --muted: #666;
      --accent: #7c6af7;
      --accent-dim: #3d3566;
      --green: #4ade80;
      --yellow: #facc15;
      --red: #f87171;
      --type-preference: #818cf8;
      --type-project_fact: #34d399;
      --type-constraint: #f87171;
      --type-goal: #fbbf24;
      --type-episodic: #94a3b8;
      --type-skill: #c084fc;
    }
    body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; min-height: 100vh; }

    header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid var(--border); }
    .logo { font-weight: 700; font-size: 18px; letter-spacing: -0.5px; }
    .logo span { color: var(--accent); }
    .stats-bar { display: flex; gap: 24px; }
    .stat { text-align: right; }
    .stat-value { font-size: 20px; font-weight: 700; color: var(--accent); }
    .stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }

    .toolbar { display: flex; gap: 10px; padding: 16px 24px; border-bottom: 1px solid var(--border); }
    input[type=text] { flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px; color: var(--text); font-size: 14px; outline: none; transition: border-color 0.15s; }
    input[type=text]:focus { border-color: var(--accent); }
    select { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--text); font-size: 13px; cursor: pointer; }
    button { background: var(--accent); border: none; border-radius: 8px; padding: 8px 16px; color: white; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.15s; white-space: nowrap; }
    button:hover { opacity: 0.85; }
    button.ghost { background: var(--surface); border: 1px solid var(--border); color: var(--text); font-weight: 400; }
    button.danger { background: #7f1d1d; }
    button.danger:hover { background: var(--red); }

    .memory-grid { padding: 16px 24px; display: flex; flex-direction: column; gap: 8px; }

    .memory-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: grid; grid-template-columns: 1fr auto; gap: 8px; transition: border-color 0.15s; }
    .memory-card:hover { border-color: #3a3a3a; }
    .memory-content { font-size: 14px; line-height: 1.5; color: var(--text); }
    .memory-meta { display: flex; gap: 8px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
    .badge { font-size: 11px; padding: 2px 8px; border-radius: 20px; font-weight: 600; white-space: nowrap; }
    .badge-type { color: white; }
    .badge-type[data-type=preference]   { background: var(--type-preference); }
    .badge-type[data-type=project_fact] { background: var(--type-project_fact); }
    .badge-type[data-type=constraint]   { background: var(--type-constraint); }
    .badge-type[data-type=goal]         { background: var(--type-goal); color: #000; }
    .badge-type[data-type=episodic]     { background: var(--type-episodic); color: #000; }
    .badge-type[data-type=skill]        { background: var(--type-skill); }
    .badge-topic { background: #1e293b; color: #94a3b8; }
    .badge-app { background: #1e1e2e; color: #7c6af7; }
    .meta-text { font-size: 11px; color: var(--muted); }
    .importance-bar { width: 40px; height: 4px; background: var(--border); border-radius: 2px; margin-top: 2px; }
    .importance-fill { height: 100%; border-radius: 2px; background: var(--accent); }
    .card-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .btn-delete { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 4px; line-height: 1; }
    .btn-delete:hover { background: #7f1d1d; color: var(--red); }

    .empty { text-align: center; padding: 60px; color: var(--muted); }
    .empty h3 { font-size: 16px; margin-bottom: 8px; }

    .type-filters { display: flex; gap: 6px; flex-wrap: wrap; }
    .type-btn { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 4px 12px; font-size: 12px; cursor: pointer; color: var(--muted); transition: all 0.15s; }
    .type-btn.active { border-color: var(--accent); color: var(--accent); }

    #toast { position: fixed; bottom: 24px; right: 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 10px 16px; font-size: 13px; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
    #toast.show { opacity: 1; }
  </style>
</head>
<body>
  <header>
    <div class="logo">mem<span>ord</span></div>
    <div class="stats-bar">
      <div class="stat"><div class="stat-value" id="stat-total">—</div><div class="stat-label">memories</div></div>
      <div class="stat"><div class="stat-value" id="stat-types">—</div><div class="stat-label">types</div></div>
    </div>
  </header>

  <div class="toolbar">
    <input type="text" id="search-input" placeholder="Search memories…" />
    <button onclick="doSearch()">Search</button>
    <button class="ghost" onclick="loadRecent()">Recent</button>
  </div>

  <div class="toolbar" style="padding-top:0">
    <div class="type-filters" id="type-filters">
      <button class="type-btn active" data-type="" onclick="setTypeFilter(this, '')">All</button>
      <button class="type-btn" data-type="preference" onclick="setTypeFilter(this, 'preference')">preference</button>
      <button class="type-btn" data-type="project_fact" onclick="setTypeFilter(this, 'project_fact')">project_fact</button>
      <button class="type-btn" data-type="constraint" onclick="setTypeFilter(this, 'constraint')">constraint</button>
      <button class="type-btn" data-type="goal" onclick="setTypeFilter(this, 'goal')">goal</button>
      <button class="type-btn" data-type="episodic" onclick="setTypeFilter(this, 'episodic')">episodic</button>
      <button class="type-btn" data-type="skill" onclick="setTypeFilter(this, 'skill')">skill</button>
    </div>
  </div>

  <div class="memory-grid" id="memory-grid">
    <div class="empty"><h3>Loading…</h3></div>
  </div>

  <div id="toast"></div>

  <script>
    const BASE = 'http://localhost:7432';
    let activeType = '';
    let currentMemories = [];

    function toast(msg) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 2000);
    }

    function timeAgo(ms) {
      const diff = Date.now() - ms;
      const m = Math.floor(diff / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + 'm ago';
      const h = Math.floor(m / 60);
      if (h < 24) return h + 'h ago';
      return Math.floor(h / 24) + 'd ago';
    }

    function renderMemories(memories) {
      currentMemories = memories;
      const grid = document.getElementById('memory-grid');
      if (!memories.length) {
        grid.innerHTML = '<div class="empty"><h3>No memories found</h3><p>Start a conversation with Claude to build memory.</p></div>';
        return;
      }
      const filtered = activeType ? memories.filter(m => m.type === activeType) : memories;
      grid.innerHTML = filtered.map(m => \`
        <div class="memory-card" id="card-\${m.id}">
          <div>
            <div class="memory-content">\${escHtml(m.content)}</div>
            <div class="memory-meta">
              <span class="badge badge-type" data-type="\${m.type}">\${m.type}</span>
              <span class="badge badge-topic">\${m.topic || 'general'}</span>
              \${m.app !== 'unknown' ? \`<span class="badge badge-app">\${m.app}</span>\` : ''}
              <span class="meta-text">\${timeAgo(m.ingestion_time ?? m.stored ? new Date(m.stored).getTime() : Date.now())}</span>
              <div style="display:flex;align-items:center;gap:4px">
                <div class="importance-bar"><div class="importance-fill" style="width:\${Math.round((m.importance??0.5)*100)}%"></div></div>
                <span class="meta-text">\${Math.round((m.importance??0.5)*100)}%</span>
              </div>
            </div>
          </div>
          <div class="card-actions">
            <button class="btn-delete" onclick="deleteMemory('\${m.id}')" title="Forget">✕</button>
          </div>
        </div>
      \`).join('');
    }

    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    async function loadStats() {
      try {
        const r = await fetch(BASE + '/stats');
        const s = await r.json();
        document.getElementById('stat-total').textContent = s.total ?? 0;
        document.getElementById('stat-types').textContent = Object.keys(s.by_type ?? {}).length;
      } catch {}
    }

    async function loadRecent() {
      try {
        const r = await fetch(BASE + '/memories?limit=50');
        const d = await r.json();
        renderMemories(d.memories ?? []);
      } catch { toast('Could not connect to memord daemon'); }
    }

    async function doSearch() {
      const q = document.getElementById('search-input').value.trim();
      if (!q) return loadRecent();
      try {
        const r = await fetch(BASE + '/memories/search?q=' + encodeURIComponent(q) + '&limit=30');
        const d = await r.json();
        renderMemories((d.results ?? []).map(r => r.memory ?? r));
      } catch { toast('Search failed'); }
    }

    async function deleteMemory(id) {
      try {
        await fetch(BASE + '/memories/' + id, { method: 'DELETE' });
        document.getElementById('card-' + id)?.remove();
        toast('Memory forgotten');
        loadStats();
      } catch { toast('Delete failed'); }
    }

    function setTypeFilter(btn, type) {
      activeType = type;
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderMemories(currentMemories);
    }

    document.getElementById('search-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') doSearch();
    });

    // Init
    loadStats();
    loadRecent();
    setInterval(loadStats, 10000);
  </script>
</body>
</html>`;
