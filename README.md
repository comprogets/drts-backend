# Moving drts-backend's storage to MySQL (no frontend changes)

Your `index.html` already talks to `GET/PUT BACKEND_URL/api/db` with an
`x-api-key` header and treats it as an optional background sync layered on
top of localStorage. This package keeps that exact contract — only the
storage behind it moves from a flat file to MySQL.

## 1. Create the database

```
mysql -h <host> -u <user> -p < db/schema.sql
```

This creates one table, `app_state`, with a single row (`id = 1`) holding
`version`, `updated_at`, and the whole JSON blob in a `data` column.

## 2. Deploy

1. Replace `server.js` and `package.json` in your `drts-backend` repo with
   the ones here; add `.env.example` → `.env`.
2. On Render (or wherever you host it), set: `API_KEY` (same value as
   `BACKEND_API_KEY` in `index.html`), `ALLOWED_ORIGIN`, `DB_HOST`, `DB_PORT`,
   `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
3. Remove the `disk:` block from `render.yaml` — MySQL is the persistence
   layer now, no local file to keep alive across deploys.
4. Redeploy. Check `GET /api/health`.

## 3. Frontend

Nothing to change. `BACKEND_URL` and `BACKEND_API_KEY` in `index.html`
keep pointing at the same server; `getDB()`/`saveDB()` keep working exactly
as they do today. The first browser that connects after this migration will
seed the (initially empty) MySQL row with whatever's in its localStorage,
same as the old flat-file behavior on a fresh server.

## Why not the fully relational rewrite (Path B)?

Path B would mean rewriting `getDB()`/`saveDB()` and every one of their
call sites across the app — request submission, admin approve/reject,
payment verification, release, plus subsystems the relational schema never
modeled (`adminEmailOverrides`, `pushSubs`, `notifyLog`, `accountAuditLog`,
`deletedRequestsLog`) — into per-resource async calls. That's a real,
multi-week rewrite project with meaningful risk of breaking a working app,
not a same-day migration. If you want to head that direction eventually,
the cleanest way is incremental: keep this blob endpoint running, and add
new dedicated endpoints one feature at a time (e.g. migrate just payment
verification first), rather than a single big-bang cutover.
