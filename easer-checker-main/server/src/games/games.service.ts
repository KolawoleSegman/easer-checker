import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { db } from '../db';
import { games, moves, statistics } from '../db/schema';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { Board, Move, PieceColor } from '../board/Board';
import { CreateGameDto } from './dto/create-game.dto';
import { MakeMoveDto } from './dto/make-move.dto';
import { AiService } from '../ai/ai.service';

@Injectable()
export class GamesService {
  constructor(private aiService: AiService) {}

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
      const opponent = await db
        .select()
        .from(users)
        .where(eq(users.id, opponentId));
      if (opponent.length === 0) {
        throw new NotFoundException('Opponent not found');
      }
    }

    const whiteId = userId;
    const blackId = isAI ? 'AI' : isMultiplayer ? 'WAITING' : opponentId;

    const newGame = await db
      .insert(games)
      .values({
        whiteId,
        blackId: blackId!,
        status: 'ACTIVE',
        aiDifficulty: dto.difficulty || 'medium',
      })
      .returning();

    return newGame[0];
  }

  async getGame(gameId: string, userId?: string) {
    const game = await db.select().from(games).where(eq(games.id, gameId));
    if (game.length === 0) {
      throw new NotFoundException('Game not found');
    }

    if (
      userId &&
      game[0].whiteId !== userId &&
      game[0].blackId !== userId &&
      game[0].blackId !== 'AI' &&
      game[0].blackId !== 'WAITING'
    ) {
      throw new ForbiddenException('You are not a player in this game');
    }

    const gameMoves = await db
      .select()
      .from(moves)
      .where(eq(moves.gameId, gameId))
      .orderBy(moves.turnNumber);

    let board = new Board();
    for (const moveRecord of gameMoves) {
      const from = this.parseSquare(moveRecord.fromSquare);
      const to = this.parseSquare(moveRecord.toSquare);
      const isCapture = moveRecord.capturedPiece !== null;
      const move = new Move(
        from.row,
        from.col,
        to.row,
        to.col,
        isCapture,
        null,
      );
      board = board.makeMove(move);
    }

    let whiteUsername = 'Unknown';
    let blackUsername = 'Unknown';
    let whiteAvatar = '';
    let blackAvatar = '';

    if (game[0].whiteId) {
      const whiteUser = await db
        .select()
        .from(users)
        .where(eq(users.id, game[0].whiteId));
      if (whiteUser.length) {
        whiteUsername = whiteUser[0].username;
        whiteAvatar = whiteUser[0].avatar || '';
      }
    }
    if (game[0].blackId === 'AI') {
      blackUsername = 'AI';
    } else if (game[0].blackId === 'WAITING') {
      blackUsername = 'Waiting...';
    } else if (game[0].blackId) {
      const blackUser = await db
        .select()
        .from(users)
        .where(eq(users.id, game[0].blackId));
      if (blackUser.length) {
        blackUsername = blackUser[0].username;
        blackAvatar = blackUser[0].avatar || '';
      }
    }

    return {
      game: game[0],
      board: board.toJSON(),
      moves: gameMoves,
      whiteUsername,
      blackUsername,
      whiteAvatar,
      blackAvatar,
    };
  }

  async assignPlayer(gameId: string, userId: string, color: 'white' | 'black') {
    const update =
      color === 'black' ? { blackId: userId } : { whiteId: userId };
    await db.update(games).set(update).where(eq(games.id, gameId));
  }

  async makeMove(gameId: string, userId: string, dto: MakeMoveDto) {
    const game = await db.select().from(games).where(eq(games.id, gameId));
    if (game.length === 0) {
      throw new NotFoundException('Game not found');
    }
    const gameData = game[0];

    if (gameData.status !== 'ACTIVE') {
      throw new BadRequestException('Game is already finished');
    }

    const isWhite = gameData.whiteId === userId;
    const isBlack =
      gameData.blackId === userId ||
      (gameData.blackId === 'AI' && !isWhite) ||
      (gameData.blackId === 'WAITING' && !isWhite);
    if (!isWhite && !isBlack) {
      throw new ForbiddenException('You are not a player in this game');
    }

    const playerColor = isWhite ? 'white' : 'black';

    const existingMoves = await db
      .select()
      .from(moves)
      .where(eq(moves.gameId, gameId))
      .orderBy(moves.turnNumber);

    let board = new Board();
    for (const moveRecord of existingMoves) {
      const from = this.parseSquare(moveRecord.fromSquare);
      const to = this.parseSquare(moveRecord.toSquare);
      const isCapture = moveRecord.capturedPiece !== null;
      const move = new Move(
        from.row,
        from.col,
        to.row,
        to.col,
        isCapture,
        null,
      );
      board = board.makeMove(move);
    }

    const multiPiece = board.getMultiCapturePiece();
    if (multiPiece) {
      if (multiPiece.row !== dto.fromRow || multiPiece.col !== dto.fromCol) {
        throw new BadRequestException(
          `You must continue capturing with the same piece. Forced piece at (${multiPiece.row}, ${multiPiece.col}), but you tried to move from (${dto.fromRow}, ${dto.fromCol})`,
        );
      }
    }

    if (board.currentTurn !== playerColor) {
      throw new BadRequestException(
        `It is not your turn. Current turn: ${board.currentTurn}, your color: ${playerColor}`,
      );
    }

    const validMoves = board.getValidMoves(playerColor);
    const matchingMove = validMoves.find(
      (m) =>
        m.fromRow === dto.fromRow &&
        m.fromCol === dto.fromCol &&
        m.toRow === dto.toRow &&
        m.toCol === dto.toCol,
    );
    if (!matchingMove) {
      throw new BadRequestException(
        `Invalid move: (${dto.fromRow},${dto.fromCol}) -> (${dto.toRow},${dto.toCol}) is not in valid moves.`,
      );
    }

    const boardAfterHuman = board.makeMove(matchingMove);

    const moveNumber = existingMoves.length + 1;
    const fromSquare = `${dto.fromRow}-${dto.fromCol}`;
    const toSquare = `${dto.toRow}-${dto.toCol}`;
    const capturedPiece = matchingMove.capturedPiece
      ? `${matchingMove.capturedPiece.color}${matchingMove.capturedPiece.isKing ? '_king' : ''}`
      : null;

    await db.insert(moves).values({
      gameId: gameData.id,
      turnNumber: moveNumber,
      fromSquare,
      toSquare,
      capturedPiece,
      promotedToKing: false,
    });

    let winner = boardAfterHuman.checkWin();
    let status: 'ACTIVE' | 'WHITE_WINS' | 'BLACK_WINS' = 'ACTIVE';
    let winnerId: string | null = null;

    if (winner) {
      status = winner === 'white' ? 'WHITE_WINS' : 'BLACK_WINS';
      winnerId = winner === 'white' ? gameData.whiteId : gameData.blackId;
      if (winnerId === 'AI' || winnerId === 'WAITING') winnerId = null;
    }

    const mustContinue = boardAfterHuman.isMultiCaptureInProgress();

    if (mustContinue) {
      await db
        .update(games)
        .set({
          status: 'ACTIVE',
          endedAt: null,
          winnerId: null,
          pgnMoves:
            existingMoves
              .map((m) => m.fromSquare + '-' + m.toSquare)
              .join(' ') +
            ' ' +
            fromSquare +
            '-' +
            toSquare,
        })
        .where(eq(games.id, gameData.id));

      return {
        board: boardAfterHuman.toJSON(),
        move: matchingMove,
        status: 'ACTIVE',
        winner: null,
        mustContinue: true,
      };
    }

    if (status === 'ACTIVE' && gameData.blackId === 'AI') {
      const allMovesAfterHuman = await db
        .select()
        .from(moves)
        .where(eq(moves.gameId, gameId))
        .orderBy(moves.turnNumber);

      let aiBoard = new Board();
      for (const moveRecord of allMovesAfterHuman) {
        const from = this.parseSquare(moveRecord.fromSquare);
        const to = this.parseSquare(moveRecord.toSquare);
        const isCapture = moveRecord.capturedPiece !== null;
        const move = new Move(
          from.row,
          from.col,
          to.row,
          to.col,
          isCapture,
          null,
        );
        aiBoard = aiBoard.makeMove(move);
      }

      let aiWinner: PieceColor | null = null;
      let aiMoves: Move[] = [];
      let latestBoard = aiBoard;
      let aiStatus: 'ACTIVE' | 'WHITE_WINS' | 'BLACK_WINS' = 'ACTIVE';
      let safetyCounter = 0;
      const MAX_AI_MOVES = 50;

      const difficultyKey = gameData.aiDifficulty || 'medium';

      while (
        aiStatus === 'ACTIVE' &&
        latestBoard.currentTurn === 'black' &&
        safetyCounter < MAX_AI_MOVES
      ) {
        safetyCounter++;
        const aiMove = this.aiService.getBestMove(
          latestBoard,
          'black',
          difficultyKey,
        );
        if (!aiMove) break;

        const newBoard = latestBoard.makeMove(aiMove);
        aiMoves.push(aiMove);
        latestBoard = newBoard;

        aiWinner = latestBoard.checkWin();
        if (aiWinner) {
          aiStatus = aiWinner === 'white' ? 'WHITE_WINS' : 'BLACK_WINS';
          break;
        }

        if (!latestBoard.isMultiCaptureInProgress()) {
          break;
        }
      }

      let aiMoveNumber = allMovesAfterHuman.length;
      for (const aiMove of aiMoves) {
        aiMoveNumber++;
        const aiFrom = `${aiMove.fromRow}-${aiMove.fromCol}`;
        const aiTo = `${aiMove.toRow}-${aiMove.toCol}`;
        await db.insert(moves).values({
          gameId: gameData.id,
          turnNumber: aiMoveNumber,
          fromSquare: aiFrom,
          toSquare: aiTo,
          capturedPiece: aiMove.capturedPiece ? 'black' : null,
          promotedToKing: false,
        });
      }

      if (aiWinner) {
        status = aiWinner === 'white' ? 'WHITE_WINS' : 'BLACK_WINS';
        winnerId = aiWinner === 'white' ? gameData.whiteId : gameData.blackId;
        if (winnerId === 'AI') winnerId = null;
      } else {
        status = 'ACTIVE';
      }

      await db
        .update(games)
        .set({
          status: status as any,
          endedAt: status !== 'ACTIVE' ? new Date() : null,
          winnerId: winnerId,
          pgnMoves:
            allMovesAfterHuman
              .map((m) => m.fromSquare + '-' + m.toSquare)
              .join(' ') +
            ' ' +
            fromSquare +
            '-' +
            toSquare +
            aiMoves
              .map(
                (m) =>
                  ' ' +
                  m.fromRow +
                  '-' +
                  m.fromCol +
                  '-' +
                  m.toRow +
                  '-' +
                  m.toCol,
              )
              .join(''),
        })
        .where(eq(games.id, gameData.id));

      if (status !== 'ACTIVE' && winnerId) {
        await this.updateStats(winnerId, gameData);
      }

      return {
        board: latestBoard.toJSON(),
        move: aiMoves.length > 0 ? aiMoves[aiMoves.length - 1] : null,
        status,
        winner: aiWinner || null,
        mustContinue: false,
      };
    }

    await db
      .update(games)
      .set({
        status: status as any,
        endedAt: status !== 'ACTIVE' ? new Date() : null,
        winnerId: winnerId,
        pgnMoves:
          existingMoves.map((m) => m.fromSquare + '-' + m.toSquare).join(' ') +
          ' ' +
          fromSquare +
          '-' +
          toSquare,
      })
      .where(eq(games.id, gameData.id));

    if (status !== 'ACTIVE' && winnerId) {
      await this.updateStats(winnerId, gameData);
    }

    return {
      board: boardAfterHuman.toJSON(),
      move: matchingMove,
      status,
      winner: winner || null,
      mustContinue: false,
    };
  }

  // --- Helper to update statistics (includes ELO) ---
  private async updateStats(winnerId: string, gameData: any) {
    const loserId =
      gameData.whiteId === winnerId ? gameData.blackId : gameData.whiteId;

    // Update winner statistics
    const winStat = await db
      .select()
      .from(statistics)
      .where(eq(statistics.userId, winnerId));
    if (winStat.length > 0) {
      await db
        .update(statistics)
        .set({ wins: (winStat[0].wins ?? 0) + 1 })
        .where(eq(statistics.userId, winnerId));
    } else {
      await db.insert(statistics).values({ userId: winnerId, wins: 1 });
    }

    // Update loser statistics (if not AI or WAITING)
    if (loserId && loserId !== 'AI' && loserId !== 'WAITING') {
      const loseStat = await db
        .select()
        .from(statistics)
        .where(eq(statistics.userId, loserId));
      if (loseStat.length > 0) {
        await db
          .update(statistics)
          .set({ losses: (loseStat[0].losses ?? 0) + 1 })
          .where(eq(statistics.userId, loserId));
      } else {
        await db.insert(statistics).values({ userId: loserId, losses: 1 });
      }
    }

    // ---- ELO update (only for human players) ----
    if (loserId && loserId !== 'AI' && loserId !== 'WAITING') {
      const winnerUser = await db
        .select()
        .from(users)
        .where(eq(users.id, winnerId));
      const loserUser = await db
        .select()
        .from(users)
        .where(eq(users.id, loserId));
      if (winnerUser.length && loserUser.length) {
        const winnerElo = winnerUser[0].eloRating ?? 1200;
        const loserElo = loserUser[0].eloRating ?? 1200;
        const expectedWinner =
          1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
        const expectedLoser = 1 - expectedWinner;
        const newWinnerElo = Math.round(winnerElo + 32 * (1 - expectedWinner));
        const newLoserElo = Math.round(loserElo + 32 * (0 - expectedLoser));
        await db
          .update(users)
          .set({ eloRating: newWinnerElo })
          .where(eq(users.id, winnerId));
        await db
          .update(users)
          .set({ eloRating: newLoserElo })
          .where(eq(users.id, loserId));
      }
    }
  }

  private parseSquare(square: string): { row: number; col: number } {
    const [row, col] = square.split('-').map(Number);
    return { row, col };
  }
}
