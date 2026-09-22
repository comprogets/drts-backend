# Nova Schola Tanauan — shared backend

This is a small Express server that gives the document-request app a real, shared
database instead of everything living only in each visitor's browser `localStorage`.

## Why this design

The app's entire "database" has always been one JSON object (`people`, `requests`,
`adminAr`, `notifyLog`, etc.) read and written synchronously in ~60 places throughout
the HTML file via two functions: `getDB()` and `saveDB(db)`. Rewriting all of that to
call a REST API per-field would mean touching most of the app and risking breakage.

Instead, this backend stores that *same* JSON blob, and the frontend was given a thin
sync layer that keeps `getDB()`/`saveDB()` working exactly as before (instant, synchronous,
backed by `localStorage`) while quietly pushing/pulling that blob to this server in the
background. If the server is unreachable, the app keeps working purely off `localStorage`,
same as it always did — nothing about the existing behavior was removed.

## 1. Install & run locally

```bash
cd backend
npm install
cp .env.example .env
# edit .env — at minimum set API_KEY to a long random string
npm start
```

The server listens on `http://localhost:4000` by default. Check it's alive:

```bash
curl http://localhost:4000/api/health
```

## 2. Point the frontend at it

Open the HTML file and find, near the top of the `<script>` block:

```js
const BACKEND_URL = '';        // e.g. 'https://your-backend.example.com'
const BACKEND_API_KEY = '';    // must match the server's API_KEY
```

Fill in `BACKEND_URL` with wherever you deploy this server, and `BACKEND_API_KEY` with
the same value you put in `.env`. Leave both blank to keep the app exactly as it was —
local-only, nothing sent anywhere.

## 3. Deploy

Any Node host works (Render, Railway, Fly.io, a small VPS, etc.). The three things that
matter wherever you deploy:

- Set the `API_KEY` environment variable to a long random secret, and put the same value
  in the frontend's `BACKEND_API_KEY`. Without this, anyone who finds the server URL can
  read or overwrite every student/teacher's requests.
- Set `ALLOWED_ORIGIN` to the exact URL the HTML file is served from (or a comma-separated
  list), not `*`, once you're not just testing locally.
- Make sure `./data/` persists across deploys/restarts (a persistent disk/volume). On
  platforms with an ephemeral filesystem (most serverless platforms), attach a volume or
  switch `DB_FILE` in `server.js` to a hosted database instead — see "Scaling up" below.

## How data flows

- `GET /api/db` → `{ version, updatedAt, data }` — the whole blob plus a version counter.
- `PUT /api/db` with body `{ data, baseVersion }` → stores `data` as the new version and
  returns the new version number. `baseVersion` is only used to flag (not block) the rare
  case where two devices saved around the same moment — the response includes
  `conflict: true` in that case for your own logging if you want it; the write still
  succeeds (last write wins), matching how a single shared `localStorage` would behave.
- The frontend pushes ~400ms after every `saveDB()` call (debounced, so rapid edits
  collapse into one request) and pulls on login, on entering the app, and on the same
  4-second interval it already used for notification polling — no new polling loop was
  added.

## Limitations, honestly

- **Whole-blob writes.** Two staff members editing different requests at the exact same
  instant on different devices could still have one save briefly overwrite the other's,
  because the whole object is saved together rather than per-record. In practice this is
  a small school system with a handful of staff seats, saves are pushed ~400ms after each
  change, and the 4-second poll heals things quickly — but it isn't the same guarantee a
  real multi-user database with row-level writes gives you.
- **No auth beyond the one shared API key.** Every browser tab (student, teacher, or
  staff) talks to the same `/api/db` endpoint with the same key — the app's own
  login/role logic (already in the HTML) is what actually gates what a signed-in user can
  see or do; the API key just keeps random internet traffic out.
- **Flat-file storage.** Fine for a school-scale dataset (this is plain JSON, no query
  engine needed since the app always loads the whole thing anyway). If this grows into
  something much larger, see below.

## Scaling up later

If this ever outgrows a single JSON file, the only thing that needs to change is inside
`readStore()`/`writeStore()` in `server.js` — swap the file read/write for a row in
Postgres/SQLite/Mongo keyed by a single `id`, keeping the same `{ version, updatedAt,
data }` shape. Nothing in the frontend needs to change, since it only ever talks to
`GET /api/db` and `PUT /api/db`.
