// app.js — Tycho Terminal (Expanse SSRF demo)
// Node 22 LTS compatible
// NOTE: This intentionally includes an SSRF-vulnerable /comms endpoint for CTF purposes.

const express = require('express');
const axios = require('axios');
const sql = require('mssql');

const app = express();
const PORT = process.env.PORT || 3000;

// Azure SQL via System Assigned Managed Identity
const dbConfig = {
  authentication: { type: 'azure-active-directory-msi-app-service' },
  server: process.env.DB_SERVER,       // e.g., tycho-<rand>.database.windows.net
  database: 'tycho-db',
  options: { encrypt: true }
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// --- Utility: simple HTML escaper for safe rendering ---
function esc(s = '') { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }

// --- Landing Page ---
app.get('/', (req, res) => {
  // Inline SVG favicon (Tycho T) — avoids external asset
  const faviconSvg = encodeURIComponent(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'><rect width='256' height='256' rx='48' fill='#0b1220'/><circle cx='128' cy='128' r='92' fill='#132238'/><path d='M88 76h80v26h-26v78h-28V102H88z' fill='#ff6a00'/><circle cx='128' cy='200' r='6' fill='#09ff00'/></svg>`);

  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tycho Station Terminal</title>
  <meta name="theme-color" content="#0b1220" />
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;utf8,${faviconSvg}" />
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" />
  <style>
    :root {
      --bg: #0b1220;           /* dark navy */
      --panel: #0f1b2d;        /* card bg */
      --panel-2: #142641;      /* alt card */
      --fg: #e6f1ff;           /* high-contrast text */
      --muted: #c8d5e6;        /* secondary text */
      --accent: #0ea5e9;       /* primary buttons/links */
      --accent-2: #ff6a00;     /* OPA orange */
      --scan: #09ff00;         /* scanner green */
      --ok: #22c55e; --warn: #f59e0b; --bad: #ef4444;
    }
    html, body { background: var(--bg); color: var(--fg); }
    a { color: var(--accent); }
    .brand { letter-spacing: .08em }
    .frame { min-height: 100vh; display:flex; align-items:center; justify-content:center; }
    .term { width:min(1100px, 96vw); border-radius: 14px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,.6); }
    .term-head { background: linear-gradient(180deg, #121e33, #0f1b2d); padding: 14px 18px; display:flex; align-items:center; gap:12px; border-bottom: 1px solid #1c2c4a; }
    .pill { width:12px; height:12px; border-radius:50%; }
    .pill-red{background:#ef4444} .pill-amber{background:#f59e0b} .pill-green{background:#22c55e}
    .term-body { background: radial-gradient(1200px 700px at 10% -10%, rgba(14,27,45,.8), transparent),
                 radial-gradient(1000px 500px at 90% -20%, rgba(20,38,65,.8), transparent),
                 #0b1220; padding: 22px; }
    .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(280px,1fr)); gap:18px; }
    .cardx { background: var(--panel); border:1px solid #1c2c4a; border-radius:12px; padding:16px; }
    .cardx h3 { font-size: 1.1rem; margin:0 0 10px; color: var(--fg); }
    .cardx p { color: var(--muted); }
    .btn-primary { background: var(--accent); border-color: var(--accent); color: #081018; font-weight:600; }
    .btn-outline { border:1px solid #27456f; color: var(--fg); }
    label { color: var(--fg); }
    input, select, textarea { background:#0f1b2d; color: var(--fg); border:1px solid #254166; border-radius:10px; }
    pre, code { color: #d1ffe0; background: #0f1f33; border:1px solid #23406a; border-radius:10px; padding:10px; overflow:auto; }
    table { color: var(--fg); }
    th, td { border-bottom: 1px solid #1c2c4a; padding: 6px 8px; }
    .badge-opa { background: var(--accent-2); color: #0b1220; font-weight:700; }
  </style>
</head>
<body>
  <div class="frame">
    <div class="term">
      <div class="term-head">
        <span class="pill pill-red"></span>
        <span class="pill pill-amber"></span>
        <span class="pill pill-green"></span>
        <strong class="ms-2 brand">TYCHO // OPS TERMINAL</strong>
        <span class="ms-auto badge badge-opa">OPA</span>
      </div>
      <div class="term-body">
        <div class="mb-3">
          <h1 class="h4">Welcome, Beltalowda</h1>
          <p class="mb-0">Interact with all subsystems below. Every endpoint is linked so you can verify functionality — or find misconfigurations…</p>
        </div>

        <div class="grid">
          <!-- SSRF Comms Panel (/comms) -->
          <section class="cardx" aria-labelledby="comms-title">
            <h3 id="comms-title">Comms Relay <small class="text-muted">(/comms)</small></h3>
            <p>Dial a target URL and relay its response (CTF SSRF). Example: <code>http://example.com</code>.</p>
            <form id="comms-form" class="vstack gap-2" onsubmit="return false;">
              <label for="comms-url" class="form-label">Target URL</label>
              <input id="comms-url" name="url" class="form-control" placeholder="http://..." required />
              <div class="d-flex gap-2 mt-2">
                <button class="btn btn-primary" id="btn-comms">Open Channel</button>
                <a class="btn btn-outline" href="/comms?url=http://example.com" target="_blank" rel="noopener">GET Link</a>
              </div>
            </form>
            <div class="mt-3">
              <label class="form-label">Response</label>
              <pre id="comms-out" style="min-height:80px"></pre>
            </div>
          </section>

          <!-- Crew Manifest (/crew GET/POST) -->
          <section class="cardx" aria-labelledby="crew-title">
            <h3 id="crew-title">Crew Manifest <small class="text-muted">(/crew)</small></h3>
            <p>Query and add crew members on Tycho DB.</p>
            <div class="d-flex gap-2 mb-2">
              <button class="btn btn-primary" id="btn-crew-refresh">Refresh</button>
            </div>
            <div class="table-responsive" style="max-height:220px">
              <table class="table table-sm table-dark align-middle" id="crew-table">
                <thead><tr><th>First</th><th>Last</th><th>Faction</th><th>Role</th><th>Ship</th><th>Status</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
            <form id="crew-form" class="row g-2 mt-2" onsubmit="return false;">
              <div class="col-6"><input class="form-control" name="first_name" placeholder="First Name" required></div>
              <div class="col-6"><input class="form-control" name="last_name" placeholder="Last Name" required></div>
              <div class="col-4"><input class="form-control" name="faction" placeholder="Faction" value="OPA"></div>
              <div class="col-4"><input class="form-control" name="role" placeholder="Role"></div>
              <div class="col-4"><input class="form-control" name="ship" placeholder="Ship" value="Rocinante"></div>
              <div class="col-12"><input class="form-control" name="status" placeholder="Status" value="Active"></div>
              <div class="col-12 d-flex gap-2 mt-1"><button class="btn btn-primary" id="btn-crew-add">Add Crew</button></div>
            </form>
          </section>

          <!-- Incidents (/incidents) -->
          <section class="cardx" aria-labelledby="incidents-title">
            <h3 id="incidents-title">Protomolecule Incidents <small class="text-muted">(/incidents)</small></h3>
            <p>Pull the latest incident feed.</p>
            <div class="d-flex gap-2 mb-2">
              <a class="btn btn-outline" href="/incidents" target="_blank" rel="noopener">Open JSON</a>
              <button class="btn btn-primary" id="btn-incidents">Load Here</button>
            </div>
            <pre id="incidents-out" style="min-height:80px"></pre>
          </section>

          <!-- Ship Registry (/ships) -->
          <section class="cardx" aria-labelledby="ships-title">
            <h3 id="ships-title">Ship Registry <small class="text-muted">(/ships)</small></h3>
            <p>Catalog of known hulls.</p>
            <div class="d-flex gap-2 mb-2">
              <a class="btn btn-outline" href="/ships" target="_blank" rel="noopener">Open JSON</a>
              <button class="btn btn-primary" id="btn-ships">Load Here</button>
            </div>
            <pre id="ships-out" style="min-height:80px"></pre>
          </section>

          <!-- Belter Slang (/belter) -->
          <section class="cardx" aria-labelledby="belter-title">
            <h3 id="belter-title">Belter Slang <small class="text-muted">(/belter)</small></h3>
            <p>Refresh your ear, sasa ke?</p>
            <div class="d-flex gap-2 mb-2">
              <a class="btn btn-outline" href="/belter" target="_blank" rel="noopener">Open JSON</a>
              <button class="btn btn-primary" id="btn-belter">Load Here</button>
            </div>
            <pre id="belter-out" style="min-height:80px"></pre>
          </section>
        </div>

        <div class="mt-4 small text-muted">Channel: <span class="text-info">OPA://tycho/ops/terminal</span> · Status: <span class="text-success">GREEN</span></div>
      </div>
    </div>
  </div>

  <script>
    // --- Comms (/comms) --- SSRF showcase
    document.getElementById('btn-comms').addEventListener('click', async () => {
      const url = document.getElementById('comms-url').value.trim();
      const out = document.getElementById('comms-out');
      out.textContent = 'Dialing…';
      try { const r = await fetch('/comms?url=' + encodeURIComponent(url)); out.textContent = await r.text(); }
      catch (e) { out.textContent = 'Error: ' + e.message; }
    });

    // --- Crew (/crew) ---
    async function loadCrew(){
      const tbody = document.querySelector('#crew-table tbody');
      tbody.innerHTML = '<tr><td colspan="6">Loading…</td></tr>';
      try { const r = await fetch('/crew'); const data = await r.json();
        tbody.innerHTML = data.map(function(r){
          return '<tr>'+
            '<td>'+esc(r.first_name)+'</td>'+
            '<td>'+esc(r.last_name)+'</td>'+
            '<td>'+esc(r.faction||'')+'</td>'+
            '<td>'+esc(r.role||'')+'</td>'+
            '<td>'+esc(r.ship||'')+'</td>'+
            '<td>'+esc(r.status||'')+'</td>'+
          '</tr>';
        }).join('') || '<tr><td colspan="6">No records</td></tr>';
      } catch(e){ tbody.innerHTML = '<tr><td colspan="6">Error: ' + esc(e.message) + '</td></tr>';
    }
    document.getElementById('btn-crew-refresh').addEventListener('click', loadCrew);
    document.getElementById('btn-crew-add').addEventListener('click', async () => {
      const form = document.getElementById('crew-form');
      const payload = Object.fromEntries(new FormData(form).entries());
      const res = await fetch('/crew', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if(res.ok){ form.reset(); loadCrew(); } else { alert('Insert failed'); }
    });

    // --- Incidents (/incidents) ---
    document.getElementById('btn-incidents').addEventListener('click', async () => {
      const out = document.getElementById('incidents-out'); out.textContent = 'Loading…';
      try { const r = await fetch('/incidents'); out.textContent = JSON.stringify(await r.json(), null, 2); } catch(e){ out.textContent = 'Error: '+e.message; }
    });

    // --- Ships (/ships) ---
    document.getElementById('btn-ships').addEventListener('click', async () => {
      const out = document.getElementById('ships-out'); out.textContent = 'Loading…';
      try { const r = await fetch('/ships'); out.textContent = JSON.stringify(await r.json(), null, 2); } catch(e){ out.textContent = 'Error: '+e.message; }
    });

    // --- Belter (/belter) ---
    document.getElementById('btn-belter').addEventListener('click', async () => {
      const out = document.getElementById('belter-out'); out.textContent = 'Loading…';
      try { const r = await fetch('/belter'); out.textContent = JSON.stringify(await r.json(), null, 2); } catch(e){ out.textContent = 'Error: '+e.message; }
    });

    // HTML escape helper mirrored from server
    function esc(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
  </script>
</body>
</html>`);
});

// --- Intentionally vulnerable SSRF endpoint ---
app.get('/comms', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Communication link missing URL');
  try {
    const response = await axios.get(targetUrl); // SSRF by design for CTF
    res.send(response.data);
  } catch (error) {
    res.status(500).send(`Communication failed: ${error.message}`);
  }
});

// --- Crew Manifest (GET/POST) ---
app.get('/crew', async (req, res) => {
  try {
    await sql.connect(dbConfig);
    const result = await sql.query`SELECT first_name, last_name, faction, role, ship, status FROM crew_manifest`;
    res.json(result.recordset);
  } catch (error) {
    res.status(500).send(`Database query failed: ${error.message}`);
  }
});

app.post('/crew', async (req, res) => {
  const { first_name, last_name, faction, role, ship, status } = req.body;
  try {
    await sql.connect(dbConfig);
    await sql.query`INSERT INTO crew_manifest (first_name, last_name, faction, role, ship, status) VALUES (${first_name}, ${last_name}, ${faction}, ${role}, ${ship}, ${status})`;
    res.status(201).send('Crew member added successfully');
  } catch (error) {
    res.status(500).send(`Database insertion failed: ${error.message}`);
  }
});

// --- Other endpoints ---
app.get('/incidents', (req, res) => {
  res.json([
    { location: 'Eros Station', status: 'Failed containment' },
    { location: 'Venus Orbit', status: 'Unresolved anomaly' },
    { location: 'Ganymede', status: 'Contained incident' }
  ]);
});

app.get('/ships', (req, res) => {
  res.json([
    { name: 'Rocinante', class: 'Frigate', faction: 'OPA', status: 'Active' },
    { name: 'Donnager', class: 'Battleship', faction: 'MCRN', status: 'Destroyed' },
    { name: 'Scirocco', class: 'Heavy Cruiser', faction: 'MCRN', status: 'Active' }
  ]);
});

app.get('/belter', (req, res) => {
  res.json([
    { word: 'Inyalowda', meaning: 'Inner planet person' },
    { word: 'Beltalowda', meaning: 'Belter person' },
    { word: 'Kowmang', meaning: 'Understand' }
  ]);
});

// --- Start ---
app.listen(PORT, () => console.log(`Tycho Station Terminal running on port ${PORT}`));
