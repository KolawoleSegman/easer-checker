import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ---- Users ----
export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text('email').unique().notNull(),
  username: text('username').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  eloRating: integer('elo_rating').default(1200),
  avatar: text('avatar').default(''),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
});

// ---- Games ----
export const games = sqliteTable('games', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  whiteId: text('white_id')
    .notNull()
    .references(() => users.id),
  blackId: text('black_id')
    .notNull()
    .references(() => users.id),
  winnerId: text('winner_id').references(() => users.id),
  pgnMoves: text('pgn_moves').default(''),
  startedAt: integer('started_at', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  status: text('status')
    .$type<'ACTIVE' | 'WHITE_WINS' | 'BLACK_WINS' | 'DRAW' | 'ABANDONED'>()
    .default('ACTIVE'),
  aiDifficulty: text('ai_difficulty').default('medium'),
});

// ---- Moves ----
export const moves = sqliteTable('moves', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  gameId: text('game_id')
    .notNull()
    .references(() => games.id),
  turnNumber: integer('turn_number').notNull(),
  fromSquare: text('from_square').notNull(),
  toSquare: text('to_square').notNull(),
  capturedPiece: text('captured_piece'),
  promotedToKing: integer('promoted_to_king', { mode: 'boolean' }).default(
    false,
  ),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
});

// ---- Statistics ----
export const statistics = sqliteTable('statistics', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .unique()
    .notNull()
    .references(() => users.id),
  wins: integer('wins').default(0),
  losses: integer('losses').default(0),
  draws: integer('draws').default(0),
  totalMoves: integer('total_moves').default(0),
  averageTime: integer('average_time'),
  maxWinStreak: integer('max_win_streak').default(0),
});

// ---- Friendships ----
export const friendships = sqliteTable(
  'friendships',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    friendId: text('friend_id')
      .notNull()
      .references(() => users.id),
    status: text('status')
      .$type<'PENDING' | 'ACCEPTED' | 'BLOCKED'>()
      .default('PENDING'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(
      sql`CURRENT_TIMESTAMP`,
    ),
  },
  (table) => ({
    unique: unique().on(table.userId, table.friendId),
  }),
);

// ---- Notifications ----
export const notifications = sqliteTable('notifications', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  type: text('type').notNull(),
  content: text('content').notNull(),
  read: integer('read', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
});

// ---- Tournaments ----
export const tournaments = sqliteTable('tournaments', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  maxPlayers: integer('max_players').default(8),
  status: text('status')
    .$type<'WAITING' | 'ACTIVE' | 'FINISHED'>()
    .default('WAITING'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
});

// ---- Tournament Players ----
export const tournamentPlayers = sqliteTable('tournament_players', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tournamentId: text('tournament_id')
    .notNull()
    .references(() => tournaments.id),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  seed: integer('seed').default(0),
  status: text('status')
    .$type<'ACTIVE' | 'ELIMINATED' | 'WINNER'>()
    .default('ACTIVE'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
});

// ---- Tournament Matches ----
export const tournamentMatches = sqliteTable('tournament_matches', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tournamentId: text('tournament_id')
    .notNull()
    .references(() => tournaments.id),
  round: integer('round').notNull(),
  player1Id: text('player1_id').references(() => users.id),
  player2Id: text('player2_id').references(() => users.id),
  winnerId: text('winner_id').references(() => users.id),
  gameId: text('game_id').references(() => games.id),
  nextMatchId: text('next_match_id').references(() => tournamentMatches.id),
  status: text('status')
    .$type<'PENDING' | 'IN_PROGRESS' | 'COMPLETED'>()
    .default('PENDING'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
});
