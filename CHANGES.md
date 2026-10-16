# What changed

## Bugs fixed (things that were silently broken)
- **Friends/Challenge system was completely dead** — `FriendsModule` was never
  registered in `app.module.ts`, so every `/friends/*` route 404'd. Fixed.
- **Avatar uploads 404'd after upload** — the server saved files to
  `./uploads` but served static files from `./data/uploads`. Paths now match.
- **Replay page always crashed** — the route was `/replay` with no `:id`
  param, but the page required one. Split into a replay picker (`/replay`)
  and a real replay viewer (`/replay/:id`) with playback controls.
- **"Recent Games" only showed games you played as White** — any game you
  joined as Black (most multiplayer joins) was invisible. Now includes both.
- **Client hardcoded the production API URL**, ignoring `VITE_API_URL` —
  local development against a local server was impossible. Fixed in
  `api/client.ts` and `socket.ts`.
- **Tournament matches had no way to actually be played** — starting a
  tournament created match records but never created a `game`. Now each
  match creates a real game, "Play" opens it, and finishing a match
  auto-reports the result and seeds the next round.

## Features added
- **Difficulty: Expert** (plus reworked AI). The AI now uses a stronger
  evaluation (mobility, king centralization, advancement, back-row defense)
  and each difficulty has its own search depth *and* a "blunder chance" so
  Easy/Medium actually feel beatable instead of always playing perfectly.
- **Add Friend by username search** with live results (`GET /users/search`).
- **Challenge a friend** button that creates a real game against them.
- **Tournament detail page** (`/tournament/:id`) — join, start, bracket view,
  play your match, auto-advancing rounds, replay finished matches.
- **Continue playing banner** on the dashboard for any in-progress games.
- **Recent Games list** wired to real data (opponent, result, difficulty,
  color) with click-through to continue or replay.
- **Leaderboard** now shows avatars and win/loss record, not just ELO.
- **Profile page** now shows your stats and a live avatar preview before
  upload.

## Notes for running it
1. `cd server && npm install && npm run build && npm run start`
   (drizzle will create `server/data/easer_checker.db` on first run — or run
   `npx drizzle-kit push` first if you want to control migrations).
2. `cd client && npm install && npm run build` (or `npm run dev`).
3. Set `client/.env` → `VITE_API_URL=http://localhost:3001` for local dev.

Both `client` and `server` were verified to build cleanly (`npm run build`)
after these changes.
