export interface User {
  id: string;
  email: string;
  username: string;
}

export interface Game {
  id: string;
  whiteId: string;
  blackId: string;
  winnerId: string | null;
  status: "ACTIVE" | "WHITE_WINS" | "BLACK_WINS" | "DRAW" | "ABANDONED";
  pgnMoves: string;
  startedAt: string;
  endedAt: string | null;
}

export interface GameResponse {
  game: Game;
  board: BoardState;
  moves: MoveRecord[];
}

export interface BoardState {
  board: (Piece | null)[][];
  currentTurn: "white" | "black";
}

export interface Piece {
  color: "white" | "black";
  isKing: boolean;
}

export interface MoveRecord {
  id: string;
  gameId: string;
  turnNumber: number;
  fromSquare: string;
  toSquare: string;
  capturedPiece: string | null;
  promotedToKing: boolean;
  createdAt: string;
}
