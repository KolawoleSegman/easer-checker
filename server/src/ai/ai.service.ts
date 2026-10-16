import { Injectable } from '@nestjs/common';
import { Board, Move, PieceColor, Piece } from '../board/Board';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

interface DifficultyProfile {
  /** Maximum search depth (plies). */
  depth: number;
  /** Hard time budget for one search, in ms. Keeps the server responsive. */
  timeMs: number;
  // 0 = always plays the best move it finds
  blunderChance: number;
  // random noise added to scores so weaker bots don't play perfectly
  noise: number;
}

const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: { depth: 2, timeMs: 150, blunderChance: 0.35, noise: 1.5 },
  medium: { depth: 4, timeMs: 400, blunderChance: 0.12, noise: 0.6 },
  hard: { depth: 6, timeMs: 900, blunderChance: 0.03, noise: 0.15 },
  expert: { depth: 10, timeMs: 1600, blunderChance: 0, noise: 0 },
};

const WIN_SCORE = 10000;

class SearchTimeout extends Error {}

@Injectable()
export class AiService {
  getProfile(difficulty: string | null | undefined): DifficultyProfile {
    const key = (difficulty || 'medium') as Difficulty;
    return DIFFICULTY_PROFILES[key] || DIFFICULTY_PROFILES.medium;
  }

  /**
   * Static evaluation from the perspective of `color` (positive = good for
   * `color`). Deliberately cheap: it runs at every leaf of the search, and the
   * old version generated every legal move for both sides at every leaf, which
   * is what made the AI so slow.
   */
  evaluate(board: Board, color: PieceColor): number {
    const grid = board.getGrid() as Piece[][];
    const size = grid.length;
    const center = (size - 1) / 2;

    let score = 0;
    let total = 0;

    for (let r = 0; r < size; r++) {
      const row = grid[r];
      for (let c = 0; c < size; c++) {
        const piece = row[c];
        if (!piece) continue;
        total++;
        const sign = piece.color === color ? 1 : -1;

        if (piece.isKing) {
          const centerDist = Math.abs(r - center) + Math.abs(c - center);
          score += sign * (3.2 + (size - centerDist) * 0.06);
        } else {
          let val = 1.0;
          const advancement = piece.color === 'white' ? size - 1 - r : r;
          val += (advancement / size) * 0.5;
          val += (size / 2 - Math.abs(c - center)) * 0.02;
          const isBackRow =
            (piece.color === 'white' && r === size - 1) ||
            (piece.color === 'black' && r === 0);
          if (isBackRow) val += 0.15;
          score += sign * val;
        }
      }
    }

    // Being ahead matters more as the board thins out.
    if (total > 0 && total < 10) score *= 1.15;
    return score;
  }

  /**
   * Alpha-beta. Whose turn it is comes from the board itself (`currentTurn`),
   * NOT from strict alternation: after a capture that can continue, the same
   * player moves again. The old code alternated blindly, so it asked the
   * opponent for moves during a multi-capture, found none, and scored every
   * such capture as an instant win/loss.
   */
  private search(
    board: Board,
    depth: number,
    alpha: number,
    beta: number,
    color: PieceColor,
    ctx: { nodes: number; deadline: number },
  ): number {
    if ((++ctx.nodes & 255) === 0 && Date.now() > ctx.deadline) {
      throw new SearchTimeout();
    }

    const winner = board.checkWin();
    if (winner) return winner === color ? WIN_SCORE + depth : -WIN_SCORE - depth;

    const mover = board.currentTurn;
    const moves = board.getValidMoves(mover);
    if (moves.length === 0) {
      // The side to move is blocked and loses.
      return mover === color ? -WIN_SCORE - depth : WIN_SCORE + depth;
    }
    if (depth <= 0) return this.evaluate(board, color);

    const maximizing = mover === color;
    if (maximizing) {
      let best = -Infinity;
      for (const move of moves) {
        const score = this.search(board.makeMove(move), depth - 1, alpha, beta, color, ctx);
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (beta <= alpha) break;
      }
      return best;
    }
    let best = Infinity;
    for (const move of moves) {
      const score = this.search(board.makeMove(move), depth - 1, alpha, beta, color, ctx);
      if (score < best) best = score;
      if (best < beta) beta = best;
      if (beta <= alpha) break;
    }
    return best;
  }

  /**
   * Iterative deepening with a time budget. Always returns the result of the
   * deepest FULLY completed depth, so the AI answers within `timeMs` no
   * matter how big the position is.
   */
  private rankRootMoves(
    board: Board,
    color: PieceColor,
    moves: Move[],
    profile: DifficultyProfile,
    needFullRanking: boolean,
  ): { move: Move; score: number }[] {
    const ctx = { nodes: 0, deadline: Date.now() + profile.timeMs };
    // Safe fallback if even depth 1 can't finish: keep the original order.
    let ranked = moves.map((move) => ({ move, score: 0 }));

    for (let depth = 1; depth <= profile.depth; depth++) {
      try {
        const current: { move: Move; score: number }[] = [];
        let alpha = -Infinity;
        // Search the previous best move first for much better pruning.
        const order = ranked.map((r) => r.move);
        for (const move of order) {
          const child = board.makeMove(move);
          const score = this.search(
            child,
            depth - 1,
            needFullRanking ? -Infinity : alpha,
            Infinity,
            color,
            ctx,
          );
          current.push({ move, score });
          if (!needFullRanking && score > alpha) alpha = score;
        }
        current.sort((a, b) => b.score - a.score);
        ranked = current;
        if (Math.abs(ranked[0].score) >= WIN_SCORE) break; // forced result found
      } catch (e) {
        if (e instanceof SearchTimeout) break;
        throw e;
      }
    }
    return ranked;
  }

  getBestMove(
    board: Board,
    color: PieceColor,
    difficultyOrDepth: string | number = 'medium',
  ): Move | null {
    const profile: DifficultyProfile =
      typeof difficultyOrDepth === 'number'
        ? { depth: difficultyOrDepth, timeMs: 1500, blunderChance: 0, noise: 0 }
        : this.getProfile(difficultyOrDepth);

    const moves = board.getValidMoves(color);
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    const weak = profile.noise > 0 || profile.blunderChance > 0;
    const ranked = this.rankRootMoves(board, color, moves, profile, weak);

    // Occasionally pick a weaker move so easy/medium feel beatable, but never
    // an outright terrible one (stay in the lower-middle of the ranking).
    if (profile.blunderChance > 0 && Math.random() < profile.blunderChance) {
      const poolStart = Math.max(1, Math.floor(ranked.length / 2));
      const pool = ranked.slice(poolStart);
      const choice = pool.length > 0 ? pool : ranked;
      return choice[Math.floor(Math.random() * choice.length)].move;
    }

    if (profile.noise > 0) {
      const noisy = ranked
        .map((r) => ({ ...r, score: r.score + (Math.random() * 2 - 1) * profile.noise }))
        .sort((a, b) => b.score - a.score);
      return noisy[0].move;
    }
    return ranked[0].move;
  }
}
