import { Injectable } from '@nestjs/common';
import { Board, Move, PieceColor, Piece } from '../board/Board';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

interface DifficultyProfile {
  depth: number;
  // 0 = always plays the best move it finds, 1 = fully random among legal moves
  blunderChance: number;
  // extra random noise added to the evaluation so weaker bots don't play perfectly
  noise: number;
}

const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: { depth: 2, blunderChance: 0.35, noise: 1.5 },
  medium: { depth: 4, blunderChance: 0.12, noise: 0.6 },
  hard: { depth: 6, blunderChance: 0.03, noise: 0.15 },
  expert: { depth: 8, blunderChance: 0, noise: 0 },
};

@Injectable()
export class AiService {
  getProfile(difficulty: string | null | undefined): DifficultyProfile {
    const key = (difficulty || 'medium') as Difficulty;
    return DIFFICULTY_PROFILES[key] || DIFFICULTY_PROFILES.medium;
  }

  /**
   * Static evaluation of a board position from the perspective of `color`.
   * Positive = good for `color`, negative = good for the opponent.
   */
  evaluate(board: Board, color: PieceColor): number {
    const boardArray = (board as any).board as (Piece | null)[][];
    if (!boardArray || boardArray.length === 0) return 0;
    const size = boardArray.length;
    const center = (size - 1) / 2;

    let score = 0;
    const manCount = { white: 0, black: 0 };
    const kingCount = { white: 0, black: 0 };

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const piece = boardArray[r][c];
        if (!piece) continue;
        const isMine = piece.color === color;
        const sign = isMine ? 1 : -1;

        if (piece.isKing) {
          kingCount[piece.color]++;
          // Kings are much more valuable and love the center where they have
          // maximum mobility along both diagonals.
          const centerDist = Math.abs(r - center) + Math.abs(c - center);
          score += sign * (3.2 + (size - centerDist) * 0.06);
        } else {
          manCount[piece.color]++;
          let val = 1.0;

          // Advancement bonus: pieces closer to the promotion row are worth
          // more (pressure) — direction depends on color.
          const advancement = piece.color === 'white' ? r : size - 1 - r;
          val += (advancement / size) * 0.5;

          // Slight preference for staying near the center columns for board
          // control, and a small bonus for occupying the back row (defense).
          const colCenterDist = Math.abs(c - center);
          val += (size / 2 - colCenterDist) * 0.02;

          const isBackRow =
            (piece.color === 'white' && r === 0) ||
            (piece.color === 'black' && r === size - 1);
          if (isBackRow) val += 0.15;

          score += sign * val;
        }
      }
    }

    // Mobility: having more legal moves (especially capture options) is a
    // real strategic advantage in draughts.
    try {
      const myMobility = board.getValidMoves(color).length;
      const opponent = color === 'white' ? 'black' : 'white';
      const oppMobility = board.getValidMoves(opponent).length;
      score += (myMobility - oppMobility) * 0.08;
    } catch {
      // ignore — evaluate should never throw
    }

    // Material imbalance amplifier: being up material matters more as the
    // game thins out (fewer total pieces on the board).
    const totalPieces =
      manCount.white + manCount.black + kingCount.white + kingCount.black;
    if (totalPieces > 0 && totalPieces < 10) {
      score *= 1.15;
    }

    return score;
  }

  minimax(
    board: Board,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean,
    color: PieceColor,
  ): { score: number; move: Move | null } {
    const winner = board.checkWin();
    if (winner === color) return { score: 10000 + depth, move: null };
    if (winner && winner !== color)
      return { score: -10000 - depth, move: null };
    if (depth === 0) {
      return { score: this.evaluate(board, color), move: null };
    }

    const currentColor = isMaximizing
      ? color
      : color === 'white'
        ? 'black'
        : 'white';
    const moves = board.getValidMoves(currentColor);
    if (moves.length === 0) {
      return {
        score: isMaximizing ? -10000 + depth : 10000 - depth,
        move: null,
      };
    }

    let bestMove: Move | null = null;
    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of moves) {
        const newBoard = board.makeMove(move);
        const result = this.minimax(
          newBoard,
          depth - 1,
          alpha,
          beta,
          false,
          color,
        );
        if (result.score > maxEval) {
          maxEval = result.score;
          bestMove = move;
        }
        alpha = Math.max(alpha, maxEval);
        if (beta <= alpha) break;
      }
      return { score: maxEval, move: bestMove };
    } else {
      let minEval = Infinity;
      for (const move of moves) {
        const newBoard = board.makeMove(move);
        const result = this.minimax(
          newBoard,
          depth - 1,
          alpha,
          beta,
          true,
          color,
        );
        if (result.score < minEval) {
          minEval = result.score;
          bestMove = move;
        }
        beta = Math.min(beta, minEval);
        if (beta <= alpha) break;
      }
      return { score: minEval, move: bestMove };
    }
  }

  /**
   * Ranks all legal moves for `color` by how good the resulting position is,
   * using a shallow minimax search per candidate. Used to implement
   * difficulty-scaled "blunders" (weaker bots occasionally pick a
   * non-optimal move instead of the true best one).
   */
  private rankMoves(
    board: Board,
    color: PieceColor,
    depth: number,
    noise: number,
  ): { move: Move; score: number }[] {
    const moves = board.getValidMoves(color);
    const ranked = moves.map((move) => {
      const newBoard = board.makeMove(move);
      const { score } = this.minimax(
        newBoard,
        Math.max(depth - 1, 0),
        -Infinity,
        Infinity,
        false,
        color,
      );
      const jitter = noise > 0 ? (Math.random() * 2 - 1) * noise : 0;
      return { move, score: score + jitter };
    });
    ranked.sort((a, b) => b.score - a.score);
    return ranked;
  }

  getBestMove(
    board: Board,
    color: PieceColor,
    difficultyOrDepth: string | number = 'medium',
  ): Move | null {
    const profile =
      typeof difficultyOrDepth === 'number'
        ? { depth: difficultyOrDepth, blunderChance: 0, noise: 0 }
        : this.getProfile(difficultyOrDepth);

    const moves = board.getValidMoves(color);
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    // Occasionally (scaled by difficulty) pick a weaker move so easy/medium
    // bots feel beatable instead of playing perfect draughts every time.
    if (profile.blunderChance > 0 && Math.random() < profile.blunderChance) {
      const ranked = this.rankMoves(board, color, profile.depth, profile.noise);
      // Pick from the weaker half of the ranked moves (still legal, just
      // sub-optimal) so the AI never plays outright nonsensical moves.
      const poolStart = Math.max(1, Math.floor(ranked.length / 2));
      const pool = ranked.slice(poolStart);
      const choice = pool.length > 0 ? pool : ranked;
      return choice[Math.floor(Math.random() * choice.length)].move;
    }

    if (profile.noise > 0) {
      const ranked = this.rankMoves(board, color, profile.depth, profile.noise);
      return ranked[0].move;
    }

    const result = this.minimax(
      board,
      profile.depth,
      -Infinity,
      Infinity,
      true,
      color,
    );
    return result.move ?? moves[0];
  }
}
