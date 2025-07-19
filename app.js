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

// Home route with styled HTML page
app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Tycho Station Terminal</title>
            <link rel=\"stylesheet\" href=\"https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css\">
            <style>
                body { background-color: #0a0a23; color: #ffffff; }
                .terminal { margin-top: 50px; }
            </style>
        </head>
        <body>
            <div class=\"container terminal text-center\">
                <h1>Welcome to Tycho Station Terminal</h1>
                <p>Interact with ships, query crew manifests, and monitor incidents across the Belt.</p>
            </div>
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
