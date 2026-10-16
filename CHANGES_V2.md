# Round 2: reliability, speed and live multiplayer

## Why it felt slow (and what was done)
- **AI froze the whole server.** Expert AI searched 8 moves deep with no time limit, and every leaf
  of the search generated all legal moves for both sides. Because Node is single threaded, every
  other player waited. The AI now uses iterative deepening with a hard time budget per difficulty
  (easy 0.15s, medium 0.4s, hard 0.9s, expert 1.6s) and a much cheaper evaluation.
- **AI mis-evaluated captures.** Its search handed the turn to the opponent in the middle of a
  multi-capture, so it saw those captures as instant wins or losses. It follows the board's real
  turn now. (Its "advancement" and "back row" bonuses were also pointing the wrong way for each colour.)
- **Every move re-simulated the whole game** and ran ~6 database queries. Boards are cached per game,
  only new moves are applied, user names/avatars are cached briefly, and all writes of a move
  (including the AI reply and stats) happen in one transaction.
- **SQLite tuned**: WAL mode, indexes on moves/games/etc.
- **Client**: moves now show instantly (optimistic), and the server's reply carries the full game state
  so there is no extra GET after every move. The 5-second polling now runs only if the socket is down.
  The auto-capture chain no longer waits 150ms + a refetch per jump.
- **Sounds** created a new AudioContext for every sound, which lagged and then stopped working in
  long games. Sounds are now preloaded and reused.
- Debug logging of every request/payload removed.

## Opponent now sees moves live
- The server used to broadcast a partial result with no `game`/`moves`, which the client threw away,
  so the other player never saw your move without refreshing. The server now pushes the full state
  to the room after **every** committed move (REST or socket), including each jump of a capture chain.

## Bugs fixed
- **Database was never created on startup** (and tournament tables were missing from all migrations),
  so a fresh/reset database (e.g. Render free tier) broke everything. Schema is now created/upgraded
  automatically on boot.
- **Anyone could move for anyone**: sockets trusted the `userId` in each message, and in AI/waiting
  games any non-white user was treated as black. Sockets are now authenticated with the JWT, and only
  the two seated players can move. Chat names can no longer be faked.
- `/profile` returned the **password hash**. Removed.
- A player who is completely **blocked now loses** (before, the game hung forever). Added a draw rule
  (40 king-only moves without a capture).
- Clicking a landing square during a multi-capture was blocked; the auto-capture chain also ignored
  which destination you clicked. Both fixed.
- Win/lose modal and "your turn" banner were based on White regardless of who you are. Fixed (also
  handles draws and spectators, and you can close the modal to look at the board or open the replay).
- **Replay never advanced** (ignored the board returned by `makeMove`). Fixed.
- Chat messages sent while the chat panel was closed were lost. Chat stays mounted now.
- A human losing to the AI wasn't recorded as a loss; win streaks were never updated. Fixed.
- Two people opening an invite link at once could both claim the black seat; moves for the same game
  are now processed one at a time.
- Server crashed on any unhandled promise rejection (`process.exit`). It logs instead.
- **Tournaments**: odd players were silently dropped from the bracket (byes now advance); eliminating
  a player eliminated them in *every* tournament; results were reported by whichever browser polled
  (could create duplicate next-round games). The server now advances the bracket itself when a game
  ends, drawn tournament games are replayed, and the list shows real player counts.
- Removing a friend blocked them (so they could not be re-added). It now actually removes them.
- Input validation on register/login/create-game/move.

## Not changed (worth knowing)
- On Render's free plan the disk is wiped on every deploy/restart, so accounts and games reset
  unless you add a paid plan + persistent disk (see DEPLOY.md).
- The AI still runs inside the server process (time-capped). For heavy traffic, move it to a worker.
