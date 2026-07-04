// ---------- Theme definitions ----------
export type BoardTheme = {
  darkSquare: string;
  lightSquare: string;
  redAccent: string;
  frameColor: string;
  boardBackground: string;
  borderColor: string;
};

export const THEMES: Record<string, BoardTheme> = {
  nigerian: {
    darkSquare: "#d4a017",
    lightSquare: "#f5e6b8",
    redAccent: "#e11d48",
    frameColor: "#8b5a2b",
    boardBackground: "linear-gradient(145deg, #5d3a1a, #3d2b1f)",
    borderColor: "#8b5a2b",
  },
  classic: {
    darkSquare: "#b58863",
    lightSquare: "#f0d9b5",
    redAccent: "#e11d48",
    frameColor: "#6b4c2a",
    boardBackground: "linear-gradient(145deg, #4a3520, #2d1f12)",
    borderColor: "#6b4c2a",
  },
  green: {
    darkSquare: "#1e2f1e",
    lightSquare: "#4ade80",
    redAccent: "#e11d48",
    frameColor: "#14532d",
    boardBackground: "linear-gradient(145deg, #1a3a2a, #0d2115)",
    borderColor: "#14532d",
  },
  red: {
    darkSquare: "#8b1a1a",
    lightSquare: "#f5c2c2",
    redAccent: "#ff6b6b",
    frameColor: "#5a0f0f",
    boardBackground: "linear-gradient(145deg, #4a1515, #2a0808)",
    borderColor: "#5a0f0f",
  },
};

// ---------- GameBoard component ----------
interface BoardState {
  board: ({ color: string; isKing: boolean } | null)[][];
  currentTurn: "white" | "black";
  multiCapturePiece?: { row: number; col: number } | null;
}

interface Props {
  board: BoardState | null;
  onSquareClick?: (row: number, col: number) => void;
  selectedSquare?: { row: number; col: number } | null;
  validMoves?: { row: number; col: number }[];
  lastMove?: {
    from: { row: number; col: number };
    to: { row: number; col: number };
  } | null;
  theme?: BoardTheme;
}

const GameBoard = ({
  board,
  onSquareClick,
  selectedSquare,
  validMoves = [],
  lastMove,
  theme = THEMES.nigerian,
}: Props) => {
  if (!board) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
      </div>
    );
  }

  const { board: grid, currentTurn } = board;
  const multiCapturePiece = board.multiCapturePiece;
  const SIZE = 10;
  const SQUARE_SIZE = 58;

  const isDark = (row: number, col: number) => (row + col) % 2 === 0;

  const isSelected = (r: number, c: number) =>
    selectedSquare?.row === r && selectedSquare?.col === c;
  const isValidTarget = (r: number, c: number) =>
    validMoves.some((m) => m.row === r && m.col === c);
  const isLastFrom = (r: number, c: number) =>
    lastMove?.from.row === r && lastMove?.from.col === c;
  const isLastTo = (r: number, c: number) =>
    lastMove?.to.row === r && lastMove?.to.col === c;
  const isForcedCapture = (r: number, c: number) =>
    multiCapturePiece?.row === r && multiCapturePiece?.col === c;

  const darkSquareColor = theme.darkSquare;
  const lightSquareColor = theme.lightSquare;
  const redAccentColor = theme.redAccent;

  const isRedAccent = (row: number, col: number) => row === col;

  const getSquareColor = (row: number, col: number) => {
    if (isRedAccent(row, col)) return redAccentColor;
    return isDark(row, col) ? darkSquareColor : lightSquareColor;
  };

  const handleClick = (row: number, col: number) => {
    if (multiCapturePiece) {
      if (multiCapturePiece.row !== row || multiCapturePiece.col !== col) {
        return;
      }
    }
    onSquareClick?.(row, col);
  };

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${SIZE}, ${SQUARE_SIZE}px)`,
    gridTemplateRows: `repeat(${SIZE}, ${SQUARE_SIZE}px)`,
    gap: "2px",
    background: "#0f172a",
    padding: "4px",
    borderRadius: "12px",
    margin: "0 auto",
  };

  return (
    <div
      className="inline-block p-6 rounded-3xl shadow-2xl"
      style={{
        background: theme.boardBackground,
        border: `12px solid ${theme.borderColor}`,
        borderRadius: "24px",
        boxShadow:
          "0 30px 60px rgba(0,0,0,0.7), inset 0 0 20px rgba(255,215,0,0.1)",
        maxWidth: "100%",
        overflowX: "auto",
      }}
    >
      <div style={gridStyle}>
        {grid.map((row, r) =>
          row.map((piece, c) => {
            const bgColor = getSquareColor(r, c);
            const selected = isSelected(r, c);
            const valid = isValidTarget(r, c);
            const from = isLastFrom(r, c);
            const to = isLastTo(r, c);
            const forced = isForcedCapture(r, c);

            return (
              <div
                key={`${r}-${c}`}
                className="relative flex items-center justify-center cursor-pointer transition-all hover:brightness-110 active:scale-[0.97]"
                style={{
                  width: SQUARE_SIZE,
                  height: SQUARE_SIZE,
                  backgroundColor: bgColor,
                  boxShadow: "inset 0 3px 6px rgba(0,0,0,0.6)",
                }}
                onClick={() => handleClick(r, c)}
              >
                {selected && (
                  <div
                    className="absolute inset-0 z-10"
                    style={{
                      border: "4px solid #fde047",
                      boxShadow: "inset 0 0 20px rgba(250, 204, 21, 0.6)",
                    }}
                  />
                )}
                {forced && (
                  <>
                    <div
                      className="absolute inset-0 z-10 animate-pulse"
                      style={{
                        border: "4px solid #fcd34d",
                        boxShadow:
                          "inset 0 0 30px rgba(252, 211, 77, 0.7), 0 0 20px rgba(252, 211, 77, 0.4)",
                        borderRadius: "4px",
                      }}
                    />
                    <div
                      className="absolute -top-2 -right-2 z-20 text-xs font-bold bg-red-600 text-white px-1.5 py-0.5 rounded-full shadow-lg animate-bounce"
                      style={{ fontSize: "8px" }}
                    >
                      !!
                    </div>
                  </>
                )}
                {valid && (
                  <>
                    <div
                      className="absolute inset-0 z-10"
                      style={{ background: "rgba(74, 222, 128, 0.35)" }}
                    />
                    <div
                      className="absolute w-5 h-5 rounded-full z-20 border-2 border-white/80"
                      style={{
                        background: "#e11d48",
                        boxShadow: "0 0 12px #ef4444",
                      }}
                    />
                  </>
                )}
                {(from || to) && (
                  <div
                    className="absolute inset-0 z-10"
                    style={{
                      border: `3px solid ${from ? "#fbbf24" : "#e11d48"}`,
                      boxShadow: `inset 0 0 15px ${from ? "rgba(251,191,36,0.5)" : "rgba(225,29,72,0.5)"}`,
                    }}
                  />
                )}
                {piece && (
                  <div
                    className="relative flex items-center justify-center z-30"
                    style={{
                      width: "82%",
                      height: "82%",
                      borderRadius: "50%",
                      background:
                        piece.color === "white"
                          ? "linear-gradient(145deg, #f8fafc, #e2e8f0)"
                          : "linear-gradient(145deg, #334155, #1e2937)",
                      boxShadow:
                        "0 8px 16px rgba(0,0,0,0.6), inset 0 4px 8px rgba(255,255,255,0.25)",
                      border:
                        piece.color === "white"
                          ? "3px solid #e2e8f0"
                          : "3px solid #1e2937",
                    }}
                  >
                    {piece.isKing && (
                      <>
                        <div
                          className="absolute inset-0 rounded-full"
                          style={{
                            background:
                              "radial-gradient(circle, rgba(255,215,0,0.4), transparent 70%)",
                            animation: "pulse 1.5s ease-in-out infinite",
                          }}
                        />
                        <div
                          className="absolute text-4xl drop-shadow-lg"
                          style={{
                            color: "#fcd34d",
                            filter: "drop-shadow(0 0 8px #fcd34d)",
                          }}
                        >
                          ♛
                        </div>
                      </>
                    )}
                    {forced && (
                      <div
                        className="absolute -top-1 -right-1 text-lg z-40"
                        style={{
                          color: "#fcd34d",
                          filter: "drop-shadow(0 0 4px #fcd34d)",
                        }}
                      >
                        ✦
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }),
        )}
      </div>
      <div className="mt-4 flex justify-between items-center text-white/80 text-sm px-2">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-medium capitalize">
            {multiCapturePiece ? (
              <span className="text-yellow-300">
                Must capture with this piece!
              </span>
            ) : (
              <span>{currentTurn}'s turn</span>
            )}
          </span>
        </div>
        <div className="text-xs tracking-wider">NIGERIAN DRAUGHTS • 10×10</div>
      </div>
    </div>
  );
};

export default GameBoard;
