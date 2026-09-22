/**
 * Nova Schola Tanauan — Document Request & Tracking System
 * Minimal shared backend.
 *
 * The frontend's entire "database" is one JSON object (people, requests, adminAr, etc.).
 * This server just stores that same object server-side and hands it back out, so every
 * browser/device can stay in sync instead of each one having its own localStorage island.
 *
 * Endpoints:
 *   GET  /api/health          -> { ok:true }
 *   GET  /api/db              -> { version, updatedAt, data }
 *   PUT  /api/db              -> body { data, baseVersion } -> { ok:true, version, updatedAt, conflict }
 *
 * Storage: a single JSON file on disk (./data/db.json), written atomically. That matches
 * exactly what the app already assumed (one blob), so nothing about the data model changes —
 * this just gives it one shared home instead of N separate browsers. A nightly-rotated
 * backup copy is also kept in ./data/backups/.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4000;
const API_KEY = process.env.API_KEY || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const empty = { version: 0, updatedAt: Date.now(), data: null };
    fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2));
  }
}
ensureStore();

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    // Corrupt file on disk should never take the whole service down.
    return { version: 0, updatedAt: Date.now(), data: null };
  }
}

function writeStore(store) {
  // Write-then-rename so a crash mid-write can never leave a half-written db.json behind.
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, DB_FILE);

  // Keep one dated backup per calendar day (cheap insurance against a bad overwrite).
  const stamp = new Date().toISOString().slice(0, 10);
  const backupFile = path.join(BACKUP_DIR, `db-${stamp}.json`);
  if (!fs.existsSync(backupFile)) {
    fs.writeFileSync(backupFile, JSON.stringify(store, null, 2));
  }
}

function checkKey(req, res, next) {
  if (!API_KEY) return next(); // no key configured -> open (fine for local/dev use only)
  const key = req.get('x-api-key');
  if (key !== API_KEY) return res.status(401).json({ error: 'unauthorized' });
  next();
}

const app = express();
app.use(
  cors({
    origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN.split(',').map((s) => s.trim()),
  })
);
// Supporting-document uploads and e-receipt images travel through this blob as base64,
// so the body limit needs real headroom.
app.use(express.json({ limit: '30mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/db', checkKey, (req, res) => {
  res.json(readStore());
});

app.put('/api/db', checkKey, (req, res) => {
  const { data, baseVersion } = req.body || {};
  if (typeof data !== 'object' || data === null) {
    return res.status(400).json({ error: 'data must be an object' });
  }
  const store = readStore();
  // Whole-blob, last-write-wins model (this mirrors what a single shared localStorage
  // would already do). We still flag a conflict back to the caller for visibility/logging
  // rather than silently dropping either side's write.
  const conflict = typeof baseVersion === 'number' && baseVersion < store.version;
  const next = { version: store.version + 1, updatedAt: Date.now(), data };
  writeStore(next);
  res.json({ ok: true, version: next.version, updatedAt: next.updatedAt, conflict });
});

app.listen(PORT, () => {
  console.log(`Nova Schola Tanauan backend listening on port ${PORT}`);
  if (!API_KEY) {
    console.warn('WARNING: API_KEY is not set — /api/db is open to anyone who can reach this server. Set API_KEY before deploying publicly.');
  }
});
