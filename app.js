const express = require('express');
const axios = require('axios');
const sql = require('mssql');
const app = express();
const PORT = process.env.PORT || 3000;

const dbConfig = {
    authentication: {
        type: 'azure-active-directory-msi-app-service'
    },
    server: process.env.DB_SERVER,
    database: 'tycho-db',
    options: {
        encrypt: true
    }
};

app.use(express.json());
app.use(express.static('public'));

// Home route with OPA/Belter theming
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Tycho Station Terminal</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
        <style>
          :root {
            --bg: #0a0a23;
            --fg: #e6f1ff;
            --accent: #ff6a00;  /* OPA orange */
            --accent-2: #16a085; /* belter teal */
            --scan: #09ff00;
          }
          html, body { height: 100%; }
          body {
            background: radial-gradient(1200px 600px at 80% -10%, rgba(255,106,0,0.08), transparent 60%),
                        radial-gradient(900px 500px at 10% -10%, rgba(22,160,133,0.08), transparent 60%),
                        var(--bg);
            color: var(--fg);
            font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif;
            background-attachment: fixed;
          }
          .navbar { background: rgba(10,10,35,0.9); backdrop-filter: blur(6px); border-bottom: 1px solid rgba(255,255,255,0.08); }
          .terminal { margin-top: 48px; }
          .term-frame {
            background: #0c0c2a;
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            padding: 28px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 10px 25px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.03);
          }
          .term-frame:before {
            content: "";
            position: absolute; inset: 0;
            background: repeating-linear-gradient(transparent 0 2px, rgba(9,255,0,0.03) 2px 4px);
            pointer-events: none;
            mix-blend-mode: overlay;
            animation: flicker 6s linear infinite;
          }
          @keyframes flicker { 0%,100% { opacity: .15 } 50% { opacity: .05 } }
          .cursor { display:inline-block; width:.6ch; background: var(--scan); animation: blink 1s steps(1,end) infinite; }
          @keyframes blink { 50% { opacity: 0; } }
          .badge-opasig { background: linear-gradient(135deg, var(--accent), #ff9c4a); }
          .badge-belta { background: linear-gradient(135deg, var(--accent-2), #2ecc71); }
          .opa-hr { height: 2px; background: linear-gradient(90deg, transparent, var(--accent), transparent); border: 0; opacity: .7; }
          .opa-pulse { box-shadow: 0 0 0 0 rgba(255,106,0,.6); animation: pulse 2s infinite; }
          @keyframes pulse { 0% { box-shadow:0 0 0 0 rgba(255,106,0,.6) } 70% { box-shadow:0 0 0 12px rgba(255,106,0,0) } 100% { box-shadow:0 0 0 0 rgba(255,106,0,0) } }
          .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:16px; }
          .card { background:#0e0e2f; border:1px solid rgba(255,255,255,0.06); }
          .muted { color: #9db0c6; }
          .opa-ascii {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            color: #a6ffd0; line-height:1.1; white-space:pre; font-size:12px;
            text-shadow: 0 0 6px rgba(9,255,0,.2);
          }
          /* Small helper for inline logo sizing */
          .opa-logo { width: 32px; height: 32px; }
          .opa-logo-lg { width: 56px; height: 56px; }
        </style>
      </head>
      <body>
        <!-- Nav / Crest -->
        <nav class="navbar navbar-dark sticky-top">
          <div class="container">
            <div class="d-flex align-items-center gap-2">
              <!-- Inline “OPA crest”: asteroid belt ring + wrench -->
              <svg class="opa-logo" viewBox="0 0 100 100" aria-label="OPA Crest" role="img">
                <circle cx="50" cy="50" r="30" fill="none" stroke="url(#g1)" stroke-width="10"></circle>
                <path d="M22 78l18-18m0 0l12 12m-12-12l12-12" stroke="url(#g2)" stroke-width="8" stroke-linecap="round" fill="none"/>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="#ff6a00"/><stop offset="1" stop-color="#ff9c4a"/>
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="#16a085"/><stop offset="1" stop-color="#2ecc71"/>
                  </linearGradient>
                </defs>
              </svg>
              <span class="fw-bold">Outer Planets Alliance</span>
              <span class="badge badge-opasig ms-2">OPA</span>
              <span class="badge badge-belta ms-1">Belta Lowda</span>
            </div>
            <div class="d-flex align-items-center gap-3">
              <span class="small text-uppercase text-secondary">Tycho Station</span>
              <i class="bi bi-broadcast-pin text-warning" title="Docking telemetry live"></i>
            </div>
          </div>
        </nav>

        <!-- Terminal Hero -->
        <div class="container terminal">
          <div class="term-frame">
            <div class="text-center mb-3">
              <svg class="opa-logo-lg mb-2 opa-pulse" viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"></circle>
                <circle cx="50" cy="50" r="28" fill="none" stroke="url(#g1)" stroke-width="10"></circle>
                <path d="M28 70l18-18 12 12 12-12" stroke="url(#g2)" stroke-width="8" stroke-linecap="round" fill="none"/>
              </svg>
              <h1 class="display-6">Oi Pampa, welcome to <span style="color:var(--accent)">Tycho Station Terminal</span></h1>
              <p class="muted mb-1">Interact with ships, query crew manifests, and monitor incidents across the Belt. All with a twist.</p>
              <p class="small text-uppercase text-secondary">"Belta Lowda. Inyalowda welwala, ke?"</p>
            </div>

            <hr class="opa-hr my-4"/>

            <div class="grid">
              <!-- OPA Bulletins -->
              <div class="card p-3">
                <div class="d-flex justify-content-between align-items-center">
                  <h5 class="mb-0">OPA Bulletins</h5>
                  <span class="badge bg-warning text-dark">priority</span>
                </div>
                <ul class="mt-3 mb-0">
                  <li>Dock 3 sealed for hull refit; expect EVA traffic spikes.</li>
                  <li>Medina relays intermittent — queue long-haul telemetry.</li>
                  <li class="text-info">Remember the Cant.</li>
                </ul>
              </div>

              <!-- Belter Mottos rotate -->
              <div class="card p-3">
                <h5 class="mb-2">Mottos & Signals</h5>
                <div id="motto" class="fw-semibold" style="color:var(--accent-2)"></div>
                <div class="mt-3 opa-ascii">
{String.raw`   ____  ____    _         _           
  / __ \\/ __ \\  (_)  _____(_)__  _____ 
 / / / / / / / / /  / ___/ / _ \\/ ___/
/ /_/ / /_/ / / /  (__  ) /  __/ /    
\\____/\\____/_/ /  /____/_/\\___/_/     
          /___/   OPA • BELTA LOWDA`}
                </div>
              </div>

              <!-- Shipboard Actions -->
              <div class="card p-3">
                <h5 class="mb-2">Station Actions</h5>
                <div class="d-grid gap-2">
                  <a class="btn btn-outline-light" href="/ships"><i class="bi bi-rocket-takeoff-fill me-2"></i>Ships Registry</a>
                  <a class="btn btn-outline-light" href="/crews"><i class="bi bi-people-fill me-2"></i>Crew Manifests</a>
                  <a class="btn btn-outline-light" href="/incidents"><i class="bi bi-exclamation-triangle-fill me-2"></i>Incident Monitor</a>
                </div>
              </div>

              <!-- OPA Patches (SVG logos) -->
              <div class="card p-3">
                <h5 class="mb-3">Patch Set: Belt Ops</h5>
                <div class="d-flex flex-wrap gap-3">
                  <!-- Patch 1: Belt ring -->
                  <svg viewBox="0 0 120 120" width="84" height="84" role="img" aria-label="Belt Ring Patch">
                    <defs>
                      <linearGradient id="p1a" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stop-color="#ff6a00"/><stop offset="1" stop-color="#ffd06a"/>
                      </linearGradient>
                    </defs>
                    <circle cx="60" cy="60" r="56" fill="#0a0a23" stroke="rgba(255,255,255,.12)" stroke-width="2"/>
                    <ellipse cx="60" cy="60" rx="42" ry="18" fill="none" stroke="url(#p1a)" stroke-width="8"/>
                    <circle cx="60" cy="60" r="8" fill="#16a085"/>
                  </svg>

                  <!-- Patch 2: Tycho crane -->
                  <svg viewBox="0 0 120 120" width="84" height="84" role="img" aria-label="Tycho Crane Patch">
                    <circle cx="60" cy="60" r="56" fill="#0a0a23" stroke="rgba(255,255,255,.12)" stroke-width="2"/>
                    <path d="M25 85h70M35 85V45l26-12 24 10v42M61 33v16" stroke="#ff6a00" stroke-width="6" fill="none" stroke-linecap="round"/>
                    <circle cx="61" cy="33" r="6" fill="#2ecc71"/>
                  </svg>

                  <!-- Patch 3: Wrench & Star -->
                  <svg viewBox="0 0 120 120" width="84" height="84" role="img" aria-label="OPA Wrench Patch">
                    <circle cx="60" cy="60" r="56" fill="#0a0a23" stroke="rgba(255,255,255,.12)" stroke-width="2"/>
                    <path d="M38 78l30-30m0 0l14 14" stroke="#16a085" stroke-width="10" stroke-linecap="round" fill="none"/>
                    <polygon points="84,28 88,40 100,42 90,50 92,62 84,55 74,62 76,50 66,42 78,40" fill="#ff6a00"/>
                  </svg>
                </div>
                <p class="mt-3 muted small">Local fabricators can laser this set onto suit patches or hull plates.</p>
              </div>
            </div>

            <hr class="opa-hr my-4"/>

            <!-- Footer telemetry -->
            <div class="d-flex justify-content-between flex-wrap gap-2 small">
              <div><span class="text-secondary">Channel:</span> OPA://tycho/ops/terminal</div>
              <div><span class="text-secondary">Uptime:</span> <span id="uptime">00:00:00</span></div>
              <div><span class="text-secondary">Status:</span> <span class="text-success">GREEN</span></div>
            </div>
          </div>
        </div>

        <script>
          // Rotate mottos like a status tape
          const mottos = [
            "Belta Lowda — OPA kuat!",
            "Kowl di sa ke? We build the Belt.",
            "Stations are family. Air is life.",
            "Remember the Cant.",
            "Na kopeng fo welwala."
          ];
          let i = 0;
          const el = document.getElementById('motto');
          function tick() { el.textContent = "> " + mottos[i % mottos.length]; i++; }
          tick(); setInterval(tick, 3200);

          // Simple uptime timer
          const up = document.getElementById('uptime');
          let secs = 0; setInterval(()=>{ secs++; const h=String(Math.floor(secs/3600)).padStart(2,'0'); const m=String(Math.floor((secs%3600)/60)).padStart(2,'0'); const s=String(secs%60).padStart(2,'0'); up.textContent=\`\${h}:\${m}:\${s}\`;},1000);
        </script>
      </body>
    </html>
  `);
});


// SSRF vulnerable route
app.get('/comms', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('Communication link missing URL');
    }

    try {
        const response = await axios.get(targetUrl);
        res.send(response.data);
    } catch (error) {
        res.status(500).send(`Communication failed: ${error.message}`);
    }
});

// Crew Manifest endpoint interacting with Tycho DB
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

// Protomolecule incidents endpoint
app.get('/incidents', (req, res) => {
    const incidents = [
        { location: 'Eros Station', status: 'Failed containment' },
        { location: 'Venus Orbit', status: 'Unresolved anomaly' },
        { location: 'Ganymede', status: 'Contained incident' }
    ];
    res.json(incidents);
});

// Ship registry endpoint
app.get('/ships', (req, res) => {
    const ships = [
        { name: 'Rocinante', class: 'Frigate', faction: 'OPA', status: 'Active' },
        { name: 'Donnager', class: 'Battleship', faction: 'MCRN', status: 'Destroyed' },
        { name: 'Scirocco', class: 'Heavy Cruiser', faction: 'MCRN', status: 'Active' }
    ];
    res.json(ships);
});

// Belter Slang endpoint
app.get('/belter', (req, res) => {
    const slang = [
        { word: 'Inyalowda', meaning: 'Inner planet person' },
        { word: 'Beltalowda', meaning: 'Belter person' },
        { word: 'Kowmang', meaning: 'Understand' }
    ];
    res.json(slang);
});

// Start the server
app.listen(PORT, () => {
    console.log(`Tycho Station Terminal running on port ${PORT}`);
});
