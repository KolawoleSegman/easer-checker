import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import fs from 'fs';
import { DATA_DIR, DB_PATH } from '../common/data-dir';

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err) {
  console.error('❌ Failed to create database directory:', err);
  process.exit(1);
}

const sqlite = new Database(DB_PATH);

// ---- Performance / safety pragmas ----
// WAL lets reads and writes happen at the same time (no more "everyone waits
// while one move is written"), NORMAL sync is safe with WAL and much faster.
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('cache_size = -20000'); // ~20MB page cache
sqlite.pragma('temp_store = MEMORY');

/**
 * Idempotent schema bootstrap.
 *
 * The app never ran migrations at startup, so on a fresh database (first run,
 * or any host with an ephemeral disk such as Render's free tier) every query
 * failed with "no such table". The tournament tables were also missing from the
 * generated migrations entirely. This creates everything that is missing and
 * upgrades older databases in place — safe to run on every boot.
 */
function bootstrapSchema() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      elo_rating INTEGER DEFAULT 1200,
      avatar TEXT DEFAULT '',
      created_at INTEGER DEFAULT CURRENT_TIMESTAMP,
      updated_at INTEGER DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email);
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username);

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY NOT NULL,
      white_id TEXT NOT NULL,
      black_id TEXT NOT NULL,
      winner_id TEXT,
      pgn_moves TEXT DEFAULT '',
      started_at INTEGER DEFAULT CURRENT_TIMESTAMP,
      ended_at INTEGER,
      status TEXT DEFAULT 'ACTIVE',
      ai_difficulty TEXT DEFAULT 'medium'
    );

    CREATE TABLE IF NOT EXISTS moves (
      id TEXT PRIMARY KEY NOT NULL,
      game_id TEXT NOT NULL,
      turn_number INTEGER NOT NULL,
      from_square TEXT NOT NULL,
      to_square TEXT NOT NULL,
      captured_piece TEXT,
      promoted_to_king INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS statistics (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      draws INTEGER DEFAULT 0,
      total_moves INTEGER DEFAULT 0,
      average_time INTEGER,
      max_win_streak INTEGER DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS statistics_user_id_unique ON statistics (user_id);

    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      created_at INTEGER DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS friendships_user_id_friend_id_unique ON friendships (user_id, friend_id);

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_by TEXT NOT NULL,
      max_players INTEGER DEFAULT 8,
      status TEXT DEFAULT 'WAITING',
      started_at INTEGER,
      ended_at INTEGER,
      created_at INTEGER DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tournament_players (
      id TEXT PRIMARY KEY NOT NULL,
      tournament_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      seed INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ACTIVE',
      created_at INTEGER DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tournament_matches (
      id TEXT PRIMARY KEY NOT NULL,
      tournament_id TEXT NOT NULL,
      round INTEGER NOT NULL,
      player1_id TEXT,
      player2_id TEXT,
      winner_id TEXT,
      game_id TEXT,
      next_match_id TEXT,
      status TEXT DEFAULT 'PENDING',
      created_at INTEGER DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Upgrade databases created by older migrations.
  const addColumnIfMissing = (table: string, column: string, ddl: string) => {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as {
      name: string;
    }[];
    if (!cols.some((c) => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  };
  addColumnIfMissing('games', 'ai_difficulty', "ai_difficulty TEXT DEFAULT 'medium'");
  addColumnIfMissing('users', 'avatar', "avatar TEXT DEFAULT ''");

  // Indexes for the queries the game hits on every single move.
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_moves_game_turn ON moves (game_id, turn_number);
    CREATE INDEX IF NOT EXISTS idx_games_white ON games (white_id);
    CREATE INDEX IF NOT EXISTS idx_games_black ON games (black_id);
    CREATE INDEX IF NOT EXISTS idx_games_started ON games (started_at);
    CREATE INDEX IF NOT EXISTS idx_users_elo ON users (elo_rating);
    CREATE INDEX IF NOT EXISTS idx_friend_friend ON friendships (friend_id);
    CREATE INDEX IF NOT EXISTS idx_tplayers_tournament ON tournament_players (tournament_id);
    CREATE INDEX IF NOT EXISTS idx_tmatches_tournament ON tournament_matches (tournament_id);
    CREATE INDEX IF NOT EXISTS idx_tmatches_game ON tournament_matches (game_id);
  `);
}

bootstrapSchema();

export const db = drizzle(sqlite, { schema });
