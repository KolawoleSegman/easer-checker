# Deploying to Render

## Option A — One-click Blueprint (recommended)

This repo includes a `render.yaml` at the root that defines both services.

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, select your repo. Render reads
   `render.yaml` and shows you a preview of the `easer-checker-backend`
   (Node web service) and `easer-checker-frontend` (static site) it's about
   to create.
3. Click **Deploy Blueprint**. Render builds and deploys both — the
   frontend's `VITE_API_URL` is wired to the backend's URL automatically
   (via `fromService`/`BACKEND_HOST` in `render.yaml`), and `JWT_SECRET` is
   auto-generated.
4. Done. Visit the frontend's `*.onrender.com` URL.

**Read the top of `render.yaml` before you deploy** — it defaults to the
Free instance type, which has an **ephemeral filesystem**: your SQLite
database and uploaded avatars reset on every deploy and every restart, and
the backend cold-starts after 15 minutes of inactivity. Fine for testing,
not fine for real users. To fix that:
- In the Render dashboard, change `easer-checker-backend`'s plan to a paid
  instance type (e.g. Starter), then add a persistent disk (Settings →
  Disks) mounted at `/var/data` — this matches the `DATA_DIR` env var
  already set in `render.yaml`, so no code changes are needed.
- Or uncomment the `disk:` block in `render.yaml` and change `plan: free`
  to `plan: starter` for the backend service, then re-sync the Blueprint.

## Option B — Manual setup (two services, no render.yaml)

**Backend — New → Web Service**
- Root Directory: `server`
- Build Command: `npm install && npm run build`
- Start Command: `npm run start:prod`
- Environment variables:
  - `JWT_SECRET` — any long random string
  - `DATA_DIR` — `/var/data` (only matters if you add a persistent disk;
    otherwise the app defaults to `server/data`, which still works but
    won't survive redeploys)
- If you want persistence: use a paid plan and add a disk mounted at
  `/var/data`.

**Frontend — New → Static Site**
- Root Directory: `client`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
- Environment variables:
  - `VITE_API_URL` — your backend's Render URL, e.g.
    `https://easer-checker-backend.onrender.com` (must be set **before**
    building — it's baked into the JS bundle at build time, not read at
    runtime)
- Add a rewrite rule so client-side routing works: source `/*` → destination
  `/index.html` (Settings → Redirects/Rewrites).

## Notes
- CORS is already wide open (`origin: true` server-side), so the two
  services talking to each other across different `onrender.com` domains
  works with no extra config.
- The server already binds to `process.env.PORT` on `0.0.0.0`, which is
  exactly what Render expects — no changes needed there.
- If you ever move off SQLite (e.g. to grow past a single persistent
  disk), Render's managed Postgres is the natural next step, but that's a
  bigger migration than anything in this repo currently does.
