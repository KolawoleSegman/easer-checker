import { Injectable } from '@nestjs/common';
import { Board, Move, PieceColor, Piece } from '../board/Board';

@Injectable()
export class AiService {
  evaluate(board: Board, color: PieceColor): number {
    const boardArray = (board as any).board as (Piece | null)[][];
    if (!boardArray || boardArray.length === 0) return 0;
    const size = boardArray.length;
    let score = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const piece = boardArray[r][c];
        if (!piece) continue;
        const isWhite = piece.color === 'white';
        const multiplier = isWhite === (color === 'white') ? 1 : -1;
        let val = 1;
        if (piece.isKing) val = 1.5;
        const centerDist =
          Math.abs(r - (size - 1) / 2) + Math.abs(c - (size - 1) / 2);
        val += (size - centerDist) * 0.05;
        score += val * multiplier;
      }
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

  getBestMove(board: Board, color: PieceColor, depth: number = 4): Move | null {
    const result = this.minimax(board, depth, -Infinity, Infinity, true, color);
    return result.move;
  }
}
