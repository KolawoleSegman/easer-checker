import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { db } from '../db';
import { games, moves, statistics, users } from '../db/schema';
import { eq, asc, and, or, ne, desc } from 'drizzle-orm';
import { Board, Move, PieceColor } from '../board/Board';
import { CreateGameDto } from './dto/create-game.dto';
import { MakeMoveDto } from './dto/make-move.dto';
import { AiService } from '../ai/ai.service';
import { getUserInfo } from '../common/user-cache';

type GameStatus = 'ACTIVE' | 'WHITE_WINS' | 'BLACK_WINS' | 'DRAW' | 'ABANDONED';

/** Number of consecutive king-only, non-capturing plies after which a game is drawn. */
const DRAW_QUIET_PLIES = 40;

interface CachedBoard {
  count: number;
  board: Board;
  /** consecutive plies with only king moves and no capture */
  quiet: number;
}

export interface GameFinishedEvent {
  gameId: string;
  status: GameStatus;
  winnerId: string | null;
}

@Injectable()
export class GamesService {
  constructor(private aiService: AiService) {}

  // ---------------------------------------------------------------------
  // Internals: board cache, per-game lock, finish listeners
  // ---------------------------------------------------------------------
  private boardCache = new Map<string, CachedBoard>();
  private locks = new Map<string, Promise<unknown>>();
  private finishListeners: ((e: GameFinishedEvent) => void | Promise<void>)[] =
    [];

  private stateListeners: ((gameId: string, state: any) => void)[] = [];

  /**
   * Fired after EVERY committed move (REST or socket). The gateway uses this
   * to push the new state to everyone in the game room, so the opponent sees
   * moves live no matter how the mover submitted them.
   */
  onStateChanged(listener: (gameId: string, state: any) => void) {
    this.stateListeners.push(listener);
  }

  /** Other modules (e.g. tournaments) can react to a game ending. */
  onGameFinished(listener: (e: GameFinishedEvent) => void | Promise<void>) {
    this.finishListeners.push(listener);
  }

  /**
   * Moves for the same game are processed one at a time. Without this, two
   * near-simultaneous requests (double click, REST + socket, reconnect) could
   * both read the same position and both write a move with the same number.
   */
  private withLock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    this.locks.set(key, next);
    next
      .finally(() => {
        if (this.locks.get(key) === next) this.locks.delete(key);
      })
      .catch(() => undefined);
    return next;
  }

  private parseSquare(square: string): { row: number; col: number } {
    const [row, col] = square.split('-').map(Number);
    return { row, col };
  }

  private applyRecord(board: Board, rec: { fromSquare: string; toSquare: string; capturedPiece: string | null }) {
    const from = this.parseSquare(rec.fromSquare);
    const to = this.parseSquare(rec.toSquare);
    const move = new Move(from.row, from.col, to.row, to.col, rec.capturedPiece !== null, null);
    return board.makeMove(move);
  }

  /**
   * Rebuilds the position for a game. The result is cached per game and only
   * the NEW moves are applied on later calls, so a long game no longer gets
   * re-simulated from move 1 on every request.
   */
  private getBoardFor(
    gameId: string,
    rows: { fromSquare: string; toSquare: string; capturedPiece: string | null }[],
  ): CachedBoard {
    let entry = this.boardCache.get(gameId);
    if (!entry || entry.count > rows.length) {
      entry = { count: 0, board: new Board(), quiet: 0 };
    } else if (entry.count === rows.length) {
      return entry;
    }

    let board = entry.board;
    let quiet = entry.quiet;
    for (let i = entry.count; i < rows.length; i++) {
      const rec = rows[i];
      const from = this.parseSquare(rec.fromSquare);
      const movedPiece = board.getGrid()[from.row]?.[from.col];
      const isCapture = rec.capturedPiece !== null;
      if (isCapture || !movedPiece || !movedPiece.isKing) quiet = 0;
      else quiet++;
      board = this.applyRecord(board, rec);
    }

    const fresh: CachedBoard = { count: rows.length, board, quiet };
    this.boardCache.set(gameId, fresh);
    if (this.boardCache.size > 300) {
      const oldest = this.boardCache.keys().next().value;
      if (oldest !== undefined) this.boardCache.delete(oldest);
    }
    return fresh;
  }

  private loadMoves(gameId: string) {
    return db
      .select()
      .from(moves)
      .where(eq(moves.gameId, gameId))
      .orderBy(asc(moves.turnNumber))
      .all();
  }

  private buildState(gameRow: typeof games.$inferSelect, moveRows: any[], board: Board) {
    let whiteUsername = 'Unknown';
    let whiteAvatar = '';
    let blackUsername = 'Unknown';
    let blackAvatar = '';

    const white = getUserInfo(gameRow.whiteId);
    if (white) {
      whiteUsername = white.username;
      whiteAvatar = white.avatar;
    }
    if (gameRow.blackId === 'AI') blackUsername = 'AI';
    else if (gameRow.blackId === 'WAITING') blackUsername = 'Waiting...';
    else {
      const black = getUserInfo(gameRow.blackId);
      if (black) {
        blackUsername = black.username;
        blackAvatar = black.avatar;
      }
    }

    return {
      game: gameRow,
      board: board.toJSON(),
      moves: moveRows,
      whiteUsername,
      blackUsername,
      whiteAvatar,
      blackAvatar,
    };
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------
  async createGame(userId: string, dto: CreateGameDto) {
    const isAI = dto.isAI || false;
    const isMultiplayer = dto.isMultiplayer || false;
    const opponentId = dto.opponentId || null;

    if (!isAI && !isMultiplayer && !opponentId) {
      throw new BadRequestException(
        'Either specify opponent, AI mode, or multiplayer',
      );
    }

    if (opponentId) {
      if (opponentId === userId) {
        throw new BadRequestException('You cannot play against yourself');
      }
      const opponent = db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, opponentId))
        .get();
      if (!opponent) throw new NotFoundException('Opponent not found');
    }

    const blackId = isAI ? 'AI' : opponentId ? opponentId : 'WAITING';

    const [newGame] = await db
      .insert(games)
      .values({
        whiteId: userId,
        blackId,
        status: 'ACTIVE',
        aiDifficulty: dto.difficulty || 'medium',
      })
      .returning();

    return newGame;
  }

  async getGame(gameId: string, userId?: string) {
    const gameRow = db.select().from(games).where(eq(games.id, gameId)).get();
    if (!gameRow) throw new NotFoundException('Game not found');

    if (
      userId &&
      gameRow.whiteId !== userId &&
      gameRow.blackId !== userId &&
      gameRow.blackId !== 'AI' &&
      gameRow.blackId !== 'WAITING'
    ) {
      throw new ForbiddenException('You are not a player in this game');
    }

    const moveRows = this.loadMoves(gameId);
    const { board } = this.getBoardFor(gameId, moveRows);
    return this.buildState(gameRow, moveRows, board);
  }

  /**
   * Second player claims the black seat. Atomic (single conditional UPDATE),
   * so if two people open the invite link at the same moment only one gets in.
   */
  async joinGame(gameId: string, userId: string) {
    return this.withLock(gameId, async () => {
      const gameRow = db.select().from(games).where(eq(games.id, gameId)).get();
      if (!gameRow) throw new NotFoundException('Game not found');

      if (gameRow.whiteId === userId || gameRow.blackId === userId) {
        return { joined: false, state: await this.getGame(gameId, userId) };
      }
      if (gameRow.blackId !== 'WAITING') {
        throw new ForbiddenException('You are not a player in this game');
      }

      const res = db
        .update(games)
        .set({ blackId: userId })
        .where(and(eq(games.id, gameId), eq(games.blackId, 'WAITING')))
        .run();
      if (res.changes === 0) {
        throw new ForbiddenException('Someone else already joined this game');
      }
      return { joined: true, state: await this.getGame(gameId, userId) };
    });
  }

  async makeMove(gameId: string, userId: string, dto: MakeMoveDto) {
    return this.withLock(gameId, () => this.makeMoveLocked(gameId, userId, dto));
  }

  private async makeMoveLocked(gameId: string, userId: string, dto: MakeMoveDto) {
    const gameData = db.select().from(games).where(eq(games.id, gameId)).get();
    if (!gameData) throw new NotFoundException('Game not found');

    if (gameData.status !== 'ACTIVE') {
      throw new BadRequestException('Game is already finished');
    }
    if (gameData.blackId === 'WAITING') {
      throw new BadRequestException('Waiting for an opponent to join');
    }

    // Only the two seated players may move. (Previously anyone who wasn't
    // white was treated as black in AI / waiting games.)
    let playerColor: PieceColor;
    if (gameData.whiteId === userId) playerColor = 'white';
    else if (gameData.blackId === userId) playerColor = 'black';
    else throw new ForbiddenException('You are not a player in this game');

    const existingMoves = this.loadMoves(gameId);
    const cached = this.getBoardFor(gameId, existingMoves);
    const board = cached.board;

    if (board.currentTurn !== playerColor) {
      throw new BadRequestException('It is not your turn');
    }

    const multiPiece = board.getMultiCapturePiece();
    if (multiPiece && (multiPiece.row !== dto.fromRow || multiPiece.col !== dto.fromCol)) {
      throw new BadRequestException(
        'You must continue capturing with the same piece',
      );
    }

    const matchingMove = board
      .getValidMoves(playerColor)
      .find(
        (m) =>
          m.fromRow === dto.fromRow &&
          m.fromCol === dto.fromCol &&
          m.toRow === dto.toRow &&
          m.toCol === dto.toCol,
      );
    if (!matchingMove) {
      throw new BadRequestException('Invalid move');
    }

    // ---- Apply the player's move in memory ----
    type NewMove = {
      move: Move;
      fromSquare: string;
      toSquare: string;
      capturedPiece: string | null;
      promotedToKing: boolean;
      wasQuiet: boolean;
    };
    const pending: NewMove[] = [];
    let current = board;
    let quiet = cached.quiet;

    const record = (m: Move, b: Board): Board => {
      const piece = b.getGrid()[m.fromRow][m.fromCol];
      const after = b.makeMove(m);
      const landed = after.getGrid()[m.toRow][m.toCol];
      const wasQuiet = !m.isCapture && !!piece && piece.isKing;
      quiet = wasQuiet ? quiet + 1 : 0;
      pending.push({
        move: m,
        fromSquare: `${m.fromRow}-${m.fromCol}`,
        toSquare: `${m.toRow}-${m.toCol}`,
        capturedPiece: m.capturedPiece
          ? `${m.capturedPiece.color}${m.capturedPiece.isKing ? '_king' : ''}`
          : null,
        promotedToKing: !!piece && !piece.isKing && !!landed && landed.isKing,
        wasQuiet,
      });
      return after;
    };

    current = record(matchingMove, current);

    // ---- AI replies immediately (same request) ----
    if (gameData.blackId === 'AI' && current.getWinner() === null) {
      const difficulty = gameData.aiDifficulty || 'medium';
      let guard = 0;
      while (current.currentTurn === 'black' && guard++ < 50) {
        const aiMove = this.aiService.getBestMove(current, 'black', difficulty);
        if (!aiMove) break;
        current = record(aiMove, current);
        if (current.getWinner() !== null) break;
      }
    }

    // ---- Work out the result ----
    let status: GameStatus = 'ACTIVE';
    let winnerId: string | null = null;
    const winnerColor = current.getWinner();
    if (winnerColor) {
      status = winnerColor === 'white' ? 'WHITE_WINS' : 'BLACK_WINS';
      const wId = winnerColor === 'white' ? gameData.whiteId : gameData.blackId;
      winnerId = wId === 'AI' || wId === 'WAITING' ? null : wId;
    } else if (quiet >= DRAW_QUIET_PLIES) {
      status = 'DRAW';
    }

    const startNumber = existingMoves.length;
    const newRows = pending.map((p, i) => ({
      gameId,
      turnNumber: startNumber + i + 1,
      fromSquare: p.fromSquare,
      toSquare: p.toSquare,
      capturedPiece: p.capturedPiece,
      promotedToKing: p.promotedToKing,
    }));
    const pgnMoves = [...existingMoves, ...newRows]
      .map((m) => `${m.fromSquare}-${m.toSquare}`)
      .join(' ');

    // ---- Persist everything atomically ----
    const finished = status !== 'ACTIVE';
    const inserted = db.transaction((tx) => {
      const rows = tx.insert(moves).values(newRows).returning().all();
      tx.update(games)
        .set({
          status,
          winnerId,
          endedAt: finished ? new Date() : null,
          pgnMoves,
        })
        .where(eq(games.id, gameId))
        .run();
      if (finished) this.updateStatsTx(tx, gameId, gameData, status, winnerId);
      return rows;
    });

    // Keep the cache in sync so the next request doesn't replay anything.
    this.boardCache.set(gameId, {
      count: existingMoves.length + pending.length,
      board: current,
      quiet,
    });

    const updatedGame = {
      ...gameData,
      status,
      winnerId,
      endedAt: finished ? new Date() : null,
      pgnMoves,
    };
    const state = this.buildState(updatedGame, [...existingMoves, ...inserted], current);

    const lastPending = pending[pending.length - 1];
    const result = {
      ...state,
      move: lastPending.move,
      isCapture: pending.some((p) => p.move.isCapture),
      status,
      winner: winnerColor || null,
      mustContinue: current.isMultiCaptureInProgress(),
    };

    for (const listener of this.stateListeners) {
      try {
        listener(gameId, result);
      } catch (e) {
        console.error('state listener failed:', e);
      }
    }

    if (finished) {
      for (const listener of this.finishListeners) {
        Promise.resolve()
          .then(() => listener({ gameId, status, winnerId }))
          .catch((e) => console.error('game finish listener failed:', e));
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------
  // Stats / ELO (runs inside the same transaction as the final move)
  // ---------------------------------------------------------------------
  private updateStatsTx(
    tx: any,
    gameId: string,
    gameData: { whiteId: string; blackId: string },
    status: GameStatus,
    winnerId: string | null,
  ) {
    const isHuman = (id: string | null): id is string =>
      !!id && id !== 'AI' && id !== 'WAITING';

    const bump = (userId: string, field: 'wins' | 'losses' | 'draws') => {
      const row = tx.select().from(statistics).where(eq(statistics.userId, userId)).get();
      if (row) {
        tx.update(statistics)
          .set({ [field]: (row[field] ?? 0) + 1 })
          .where(eq(statistics.userId, userId))
          .run();
      } else {
        tx.insert(statistics).values({ userId, [field]: 1 }).run();
      }
    };

    const players = [gameData.whiteId, gameData.blackId].filter(isHuman);

    if (status === 'DRAW') {
      players.forEach((p) => bump(p, 'draws'));
      return;
    }

    const loserId = players.find((p) => p !== winnerId) ?? null;
    if (isHuman(winnerId)) bump(winnerId, 'wins');
    // A human losing to the AI (winnerId null) is still a loss for them.
    if (loserId) bump(loserId, 'losses');

    // Win streak
    if (isHuman(winnerId)) {
      const recent = tx
        .select({ winnerId: games.winnerId, status: games.status })
        .from(games)
        .where(
          and(
            or(eq(games.whiteId, winnerId), eq(games.blackId, winnerId)),
            ne(games.status, 'ACTIVE'),
            ne(games.id, gameId),
          ),
        )
        .orderBy(desc(games.endedAt))
        .limit(100)
        .all();
      // This game is the newest win; count the unbroken wins before it.
      let streak = 1;
      for (const g of recent) {
        if (g.winnerId === winnerId) streak++;
        else break;
      }
      const stat = tx.select().from(statistics).where(eq(statistics.userId, winnerId)).get();
      if (stat && streak > (stat.maxWinStreak ?? 0)) {
        tx.update(statistics).set({ maxWinStreak: streak }).where(eq(statistics.userId, winnerId)).run();
      }
    }

    // ELO only between two humans
    if (isHuman(winnerId) && loserId) {
      const w = tx.select().from(users).where(eq(users.id, winnerId)).get();
      const l = tx.select().from(users).where(eq(users.id, loserId)).get();
      if (w && l) {
        const winnerElo = w.eloRating ?? 1200;
        const loserElo = l.eloRating ?? 1200;
        const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
        const newWinnerElo = Math.round(winnerElo + 32 * (1 - expectedWinner));
        const newLoserElo = Math.round(loserElo - 32 * (1 - expectedWinner));
        tx.update(users).set({ eloRating: newWinnerElo }).where(eq(users.id, winnerId)).run();
        tx.update(users).set({ eloRating: newLoserElo }).where(eq(users.id, loserId)).run();
      }
    }
  }
}
