export type PieceColor = "white" | "black";
export type Piece = { color: PieceColor; isKing: boolean } | null;

export class Move {
  constructor(
    public fromRow: number,
    public fromCol: number,
    public toRow: number,
    public toCol: number,
    public isCapture: boolean = false,
    public capturedPiece: Piece = null,
  ) {}
}

export class Board {
  private board: Piece[][];
  public currentTurn: PieceColor;
  private readonly size: number = 10;
  private multiCapturePiece: { row: number; col: number } | null = null;

  constructor() {
    this.board = this.initializeBoard();
    this.currentTurn = "white";
  }

  private initializeBoard(): Piece[][] {
    const board: Piece[][] = Array.from({ length: this.size }, () =>
      Array(this.size).fill(null),
    );

    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col < this.size; col++) {
        const isDark = (row + col) % 2 === 0;
        if (!isDark) continue;

        let color: PieceColor | null = null;
        if (row < 4) color = "black";
        else if (row > 5) color = "white";

        if (color) {
          board[row][col] = { color, isKing: false };
        }
      }
    }
    return board;
  }

  // Set board state from server (for frontend validation)
  public setState(boardArray: Piece[][], currentTurn: PieceColor) {
    this.board = boardArray.map((row) => row.map((p) => (p ? { ...p } : null)));
    this.currentTurn = currentTurn;
    this.multiCapturePiece = null;
  }

  public getValidMoves(color: PieceColor): Move[] {
    let allMoves: Move[] = [];
    let hasCapture = false;

    if (this.multiCapturePiece) {
      const { row, col } = this.multiCapturePiece;
      const piece = this.board[row][col];
      if (!piece || piece.color !== color) {
        this.multiCapturePiece = null;
        return [];
      }
      const moves = this.getPseudoLegalMoves(row, col);
      return moves.filter((m) => m.isCapture);
    }

    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col < this.size; col++) {
        const piece = this.board[row][col];
        if (!piece || piece.color !== color) continue;
        const moves = this.getPseudoLegalMoves(row, col);
        allMoves.push(...moves);
        if (moves.some((m) => m.isCapture)) hasCapture = true;
      }
    }

    if (hasCapture) {
      return allMoves.filter((m) => m.isCapture);
    }
    return allMoves;
  }

  private getPseudoLegalMoves(row: number, col: number): Move[] {
    const piece = this.board[row][col];
    if (!piece) return [];

    const moves: Move[] = [];
    const isKing = piece.isKing;

    const directions: [number, number][] = isKing
      ? [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ]
      : piece.color === "white"
        ? [
            [-1, -1],
            [-1, 1],
          ]
        : [
            [1, -1],
            [1, 1],
          ];

    const tryAddMove = (dr: number, dc: number) => {
      const nr = row + dr;
      const nc = col + dc;
      if (this.isInBounds(nr, nc) && this.board[nr][nc] === null) {
        moves.push(new Move(row, col, nr, nc, false));
      }
    };

    const tryAddCapture = (dr: number, dc: number) => {
      const midR = row + dr;
      const midC = col + dc;
      if (!this.isInBounds(midR, midC)) return false;
      const midPiece = this.board[midR][midC];
      if (!midPiece || midPiece.color === piece.color) return false;

      const jumpR = row + 2 * dr;
      const jumpC = col + 2 * dc;
      if (this.isInBounds(jumpR, jumpC) && this.board[jumpR][jumpC] === null) {
        moves.push(new Move(row, col, jumpR, jumpC, true, midPiece));
        return true;
      }
      return false;
    };

    if (!isKing) {
      for (const [dr, dc] of directions) {
        tryAddMove(dr, dc);
      }
      const captureDirs: [number, number][] = [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ];
      for (const [dr, dc] of captureDirs) {
        tryAddCapture(dr, dc);
      }
    } else {
      for (const [dr, dc] of directions) {
        let r = row + dr;
        let c = col + dc;
        while (this.isInBounds(r, c)) {
          const target = this.board[r][c];
          if (target === null) {
            moves.push(new Move(row, col, r, c, false));
            r += dr;
            c += dc;
          } else {
            break;
          }
        }
      }
      for (const [dr, dc] of directions) {
        let r = row + dr;
        let c = col + dc;
        while (this.isInBounds(r, c)) {
          const target = this.board[r][c];
          if (target === null) {
            r += dr;
            c += dc;
            continue;
          }
          if (target.color !== piece.color) {
            const jumpR = r + dr;
            const jumpC = c + dc;
            if (
              this.isInBounds(jumpR, jumpC) &&
              this.board[jumpR][jumpC] === null
            ) {
              moves.push(new Move(row, col, jumpR, jumpC, true, target));
            }
          }
          break;
        }
      }
    }

    return moves;
  }

  public makeMove(move: Move): Board {
    const newBoard = this.clone();
    const piece = newBoard.board[move.fromRow][move.fromCol];
    if (!piece) throw new Error("No piece at source");

    newBoard.board[move.fromRow][move.fromCol] = null;
    newBoard.board[move.toRow][move.toCol] = piece;

    if (move.isCapture) {
      const rowStep = Math.sign(move.toRow - move.fromRow);
      const colStep = Math.sign(move.toCol - move.fromCol);
      let r = move.fromRow + rowStep;
      let c = move.fromCol + colStep;
      while (r !== move.toRow || c !== move.toCol) {
        const target = newBoard.board[r]?.[c];
        if (target && target.color !== piece.color) {
          newBoard.board[r][c] = null;
        }
        r += rowStep;
        c += colStep;
      }
    }

    if (!piece.isKing) {
      if (piece.color === "white" && move.toRow === 0) {
        newBoard.board[move.toRow][move.toCol]!.isKing = true;
      } else if (piece.color === "black" && move.toRow === this.size - 1) {
        newBoard.board[move.toRow][move.toCol]!.isKing = true;
      }
    }

    let furtherCapture = false;
    if (move.isCapture) {
      const destRow = move.toRow;
      const destCol = move.toCol;
      const pieceAtDest = newBoard.board[destRow][destCol];
      if (pieceAtDest) {
        const movesFromDest = newBoard.getPseudoLegalMoves(destRow, destCol);
        const captures = movesFromDest.filter((m) => m.isCapture);
        if (captures.length > 0) {
          furtherCapture = true;
          newBoard.multiCapturePiece = { row: destRow, col: destCol };
        }
      }
    }

    if (!furtherCapture) {
      newBoard.multiCapturePiece = null;
      newBoard.currentTurn = this.currentTurn === "white" ? "black" : "white";
    }

    return newBoard;
  }

  public isMultiCaptureInProgress(): boolean {
    return this.multiCapturePiece !== null;
  }

  public getMultiCapturePiece(): { row: number; col: number } | null {
    return this.multiCapturePiece;
  }

  public hasFurtherCaptures(row: number, col: number): boolean {
    const piece = this.board[row][col];
    if (!piece) return false;
    const moves = this.getPseudoLegalMoves(row, col);
    return moves.some((m) => m.isCapture);
  }

  private isInBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.size && col >= 0 && col < this.size;
  }

  public clone(): Board {
    const b = new Board();
    b.board = this.board.map((row) => row.map((p) => (p ? { ...p } : null)));
    b.currentTurn = this.currentTurn;
    b.multiCapturePiece = this.multiCapturePiece
      ? { ...this.multiCapturePiece }
      : null;
    return b;
  }

  public toJSON(): any {
    return {
      board: this.board,
      currentTurn: this.currentTurn,
      multiCapturePiece: this.multiCapturePiece,
    };
  }

  public checkWin(): PieceColor | null {
    let whiteCount = 0,
      blackCount = 0;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const p = this.board[r][c];
        if (p) {
          if (p.color === "white") whiteCount++;
          else blackCount++;
        }
      }
    }
    if (whiteCount === 0) return "black";
    if (blackCount === 0) return "white";
    return null;
  }
}
