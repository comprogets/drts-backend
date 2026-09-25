// ============================================================================
// Nova Schola Tanauan DRTS — shared backend (Path A: MySQL-backed blob store)
//
// Same contract the frontend already speaks — GET/PUT /api/db, x-api-key
// header — just backed by a MySQL row instead of a flat file on disk.
// The frontend's index.html needs ZERO changes for this swap.
// ============================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const {
  PORT = 4000,
  API_KEY,
  ALLOWED_ORIGIN = '',
  DB_HOST,
  DB_PORT = 3306,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
} = process.env;

const app = express();
app.use(express.json({ limit: '10mb' })); // the blob can grow; raise if you hit 413s
app.use(
  cors({
    origin: ALLOWED_ORIGIN ? ALLOWED_ORIGIN.split(',').map((s) => s.trim()) : '*',
  })
);

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

function checkApiKey(req, res, next) {
  if (!API_KEY) return next(); // no key configured = open (matches old server's default)
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

// GET /api/db -> { version, updatedAt, data }
app.get('/api/db', checkApiKey, async (req, res, next) => {
  try {
    const [[row]] = await pool.query(`SELECT version, updated_at, data FROM app_state WHERE id = 1`);
    if (!row) return res.json({ version: 0, updatedAt: null, data: null });
    res.json({
      version: row.version,
      updatedAt: row.updated_at,
      data: row.data, // mysql2 already parses JSON columns into objects
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/db  body: { data, baseVersion } -> { version, conflict? }
// Whole-blob write, last-write-wins — matches the previous flat-file behavior.
// baseVersion is only used to flag (not block) two near-simultaneous saves.
app.put('/api/db', checkApiKey, async (req, res, next) => {
  const { data, baseVersion } = req.body || {};
  if (typeof data === 'undefined') {
    return res.status(400).json({ error: 'Missing "data" in request body' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock the row so two concurrent PUTs can't both read the same old version.
    const [[row]] = await conn.query(`SELECT version FROM app_state WHERE id = 1 FOR UPDATE`);
    const currentVersion = row ? row.version : 0;
    const nextVersion = currentVersion + 1;
    const conflict = typeof baseVersion === 'number' && baseVersion !== currentVersion;

    await conn.query(
      `INSERT INTO app_state (id, version, data) VALUES (1, ?, ?)
       ON DUPLICATE KEY UPDATE version = VALUES(version), data = VALUES(data)`,
      [nextVersion, JSON.stringify(data)]
    );

    await conn.commit();
    res.json({ version: nextVersion, conflict });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => console.log(`DRTS backend (MySQL blob store) listening on :${PORT}`));
