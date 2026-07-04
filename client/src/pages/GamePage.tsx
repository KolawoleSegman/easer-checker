import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/client";
import GameBoard, { THEMES } from "../components/GameBoard";
import { Board, Move, type Piece, type PieceColor } from "../lib/board";
import { getSocket } from "../socket";
import ChatBox from "../components/ChatBox";
import { playSound } from "../sounds";

// --- Interfaces ---
interface Game {
  id: string;
  whiteId: string;
  blackId: string;
  winnerId: string | null;
  status: "ACTIVE" | "WHITE_WINS" | "BLACK_WINS" | "DRAW" | "ABANDONED";
  pgnMoves: string;
  startedAt: string;
  endedAt: string | null;
}

interface MoveRecord {
  id: string;
  gameId: string;
  turnNumber: number;
  fromSquare: string;
  toSquare: string;
  capturedPiece: string | null;
  promotedToKing: boolean;
  createdAt: string;
}

interface BoardState {
  board: (Piece | null)[][];
  currentTurn: "white" | "black";
  multiCapturePiece?: { row: number; col: number } | null;
}

interface GameResponse {
  game: Game;
  board: BoardState;
  moves: MoveRecord[];
  whiteUsername: string;
  blackUsername: string;
  whiteAvatar: string;
  blackAvatar: string;
}

// --- Component ---
const GamePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [game, setGame] = useState<GameResponse | null>(null);
  const [boardKey, setBoardKey] = useState(0);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(
    null,
  );
  const [validMoves, setValidMoves] = useState<{ row: number; col: number }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastMove, setLastMove] = useState<{
    from: { row: number; col: number };
    to: { row: number; col: number };
  } | null>(null);
  const [makingMove, setMakingMove] = useState(false);
  const [localBoard, setLocalBoard] = useState<Board | null>(null);
  const [autoCapturing, setAutoCapturing] = useState(false);
  const autoCaptureTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [selectedTheme, setSelectedTheme] = useState(() => {
    const saved = localStorage.getItem("boardTheme");
    return saved && THEMES[saved] ? saved : "nigerian";
  });

  const handleThemeChange = (themeKey: string) => {
    setSelectedTheme(themeKey);
    localStorage.setItem("boardTheme", themeKey);
  };

  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const socketRef = useRef<any>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [user, setUser] = useState<{ id: string; username: string } | null>(
    null,
  );
  const moveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
  }, []);

  // ---- Helper: Best capture chain ----
  const getBestCaptureChain = (
    board: Board,
    color: PieceColor,
    fromRow: number,
    fromCol: number,
  ): Move[] => {
    const allMoves = board.getValidMoves(color);
    const captureMoves = allMoves.filter(
      (m) => m.fromRow === fromRow && m.fromCol === fromCol && m.isCapture,
    );
    if (captureMoves.length === 0) return [];

    let bestChain: Move[] = [];
    let bestCount = -1;

    for (const move of captureMoves) {
      const chain: Move[] = [move];
      let currentBoard = board.clone().makeMove(move);
      while (currentBoard.isMultiCaptureInProgress()) {
        const forced = currentBoard.getMultiCapturePiece();
        if (!forced) break;
        const nextMoves = currentBoard
          .getValidMoves(color)
          .filter(
            (m) =>
              m.fromRow === forced.row &&
              m.fromCol === forced.col &&
              m.isCapture,
          );
        if (nextMoves.length === 0) break;
        const nextMove = nextMoves[0];
        chain.push(nextMove);
        currentBoard = currentBoard.makeMove(nextMove);
      }
      const captureCount = chain.filter((m) => m.isCapture).length;
      if (captureCount > bestCount) {
        bestCount = captureCount;
        bestChain = chain;
      }
    }
    return bestChain;
  };

  // ---- Auto-capture ----
  const performAutoCapture = async () => {
    if (autoCaptureTimerRef.current) {
      clearTimeout(autoCaptureTimerRef.current);
      autoCaptureTimerRef.current = null;
    }
    if (!game || game.game.status !== "ACTIVE" || !localBoard) {
      setAutoCapturing(false);
      return;
    }
    const multiPiece = game.board.multiCapturePiece;
    if (!multiPiece) {
      setAutoCapturing(false);
      return;
    }
    const chain = getBestCaptureChain(
      localBoard,
      game.board.currentTurn,
      multiPiece.row,
      multiPiece.col,
    );
    if (chain.length === 0) {
      setAutoCapturing(false);
      return;
    }
    const nextMove = chain[0];

    try {
      const res = await api.post(`/games/${id}/move`, {
        fromRow: nextMove.fromRow,
        fromCol: nextMove.fromCol,
        toRow: nextMove.toRow,
        toCol: nextMove.toCol,
      });
      await fetchGame();
      if (res.data && res.data.mustContinue) {
        autoCaptureTimerRef.current = setTimeout(() => {
          performAutoCapture();
        }, 300);
      } else {
        setAutoCapturing(false);
      }
    } catch (err) {
      console.error("Auto-capture failed:", err);
      setAutoCapturing(false);
    }
  };

  useEffect(() => {
    if (game && game.board.multiCapturePiece && !autoCapturing && !makingMove) {
      setAutoCapturing(true);
      autoCaptureTimerRef.current = setTimeout(() => {
        performAutoCapture();
      }, 200);
    }
    return () => {
      if (autoCaptureTimerRef.current) {
        clearTimeout(autoCaptureTimerRef.current);
        autoCaptureTimerRef.current = null;
      }
    };
  }, [game]);

  // ---- Fetch game from REST ----
  const fetchGame = async () => {
    try {
      const res = await api.get(`/games/${id}`);
      const data: GameResponse = res.data;
      setGame(data);
      setBoardKey((prev) => prev + 1);

      const board = new Board();
      board.setState(data.board.board, data.board.currentTurn);
      if (data.board.multiCapturePiece) {
        (board as any).multiCapturePiece = data.board.multiCapturePiece;
      }
      setLocalBoard(board);

      if (data.moves && data.moves.length > 0) {
        const last = data.moves[data.moves.length - 1];
        const [fromRow, fromCol] = last.fromSquare.split("-").map(Number);
        const [toRow, toCol] = last.toSquare.split("-").map(Number);
        setLastMove({
          from: { row: fromRow, col: fromCol },
          to: { row: toRow, col: toCol },
        });
      } else {
        setLastMove(null);
      }

      if (data.board.multiCapturePiece) {
        const forced = data.board.multiCapturePiece;
        setSelected({ row: forced.row, col: forced.col });
        if (board) {
          const moves = board.getValidMoves(data.board.currentTurn);
          const targets = moves
            .filter((m) => m.fromRow === forced.row && m.fromCol === forced.col)
            .map((m) => ({ row: m.toRow, col: m.toCol }));
          setValidMoves(targets);
        }
      } else {
        setSelected(null);
        setValidMoves([]);
      }

      // ---- Play sound if game ended ----
      if (data.game.status !== "ACTIVE" && data.game.winnerId) {
        if (data.game.winnerId === data.game.whiteId) {
          playSound("win");
        } else if (data.game.winnerId === data.game.blackId) {
          playSound("lose");
        }
      }

      setLoading(false);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load game");
      setLoading(false);
    }
  };

  // ---- Polling every 2 seconds ----
  useEffect(() => {
    fetchGame();
    const interval = setInterval(() => {
      fetchGame();
    }, 2000);
    return () => clearInterval(interval);
  }, [id]);

  // ---- Detect multiplayer mode ----
  useEffect(() => {
    if (game) {
      const isMP =
        game.game.blackId === "WAITING" ||
        (game.game.blackId !== "AI" && game.game.blackId !== game.game.whiteId);
      setIsMultiplayer(isMP);
    }
  }, [game]);

  // ---- Socket setup ----
  useEffect(() => {
    if (!isMultiplayer || !game || !user) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    const socket = getSocket(token);
    socketRef.current = socket;

    const onConnect = () => {
      console.log("Socket connected");
      setSocketConnected(true);
      socket.emit("join_room", { gameId: id, userId: user.id });
    };

    const onGameState = (data: any) => {
      if (!data || !data.moves) return;
      console.log("game_state received:", data);
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
        moveTimeoutRef.current = null;
      }
      setGame(data);
      setBoardKey((prev) => prev + 1);
      setMakingMove(false);
      const board = new Board();
      board.setState(data.board.board, data.board.currentTurn);
      if (data.board.multiCapturePiece) {
        (board as any).multiCapturePiece = data.board.multiCapturePiece;
      }
      setLocalBoard(board);
      if (data.moves && data.moves.length > 0) {
        const last = data.moves[data.moves.length - 1];
        const [fromRow, fromCol] = last.fromSquare.split("-").map(Number);
        const [toRow, toCol] = last.toSquare.split("-").map(Number);
        setLastMove({
          from: { row: fromRow, col: fromCol },
          to: { row: toRow, col: toCol },
        });
      } else {
        setLastMove(null);
      }
      if (data.board.multiCapturePiece) {
        const forced = data.board.multiCapturePiece;
        setSelected({ row: forced.row, col: forced.col });
        const moves = board.getValidMoves(data.board.currentTurn);
        const targets = moves
          .filter((m) => m.fromRow === forced.row && m.fromCol === forced.col)
          .map((m) => ({ row: m.toRow, col: m.toCol }));
        setValidMoves(targets);
      } else {
        setSelected(null);
        setValidMoves([]);
      }

      if (data.game.status !== "ACTIVE" && data.game.winnerId) {
        if (data.game.winnerId === data.game.whiteId) {
          playSound("win");
        } else if (data.game.winnerId === data.game.blackId) {
          playSound("lose");
        }
      }
    };

    const onGameOver = (data: any) => {
      if (data) setGame(data);
      setMakingMove(false);
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
        moveTimeoutRef.current = null;
      }
    };

    const onError = (err: any) => {
      console.error("Socket error:", err);
      setMakingMove(false);
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
        moveTimeoutRef.current = null;
      }
    };

    socket.on("connect", onConnect);
    socket.on("game_state", onGameState);
    socket.on("game_over", onGameOver);
    socket.on("error", onError);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("game_state", onGameState);
      socket.off("game_over", onGameOver);
      socket.off("error", onError);
    };
  }, [isMultiplayer, game, user, id]);

  // ---- Handle square click ----
  const handleSquareClick = (row: number, col: number) => {
    if (!game || game.game.status !== "ACTIVE" || makingMove || autoCapturing)
      return;
    const multiPiece = game.board.multiCapturePiece;
    if (multiPiece) return;

    if (selected) {
      if (selected.row === row && selected.col === col) {
        setSelected(null);
        setValidMoves([]);
        return;
      }
      const isValid = validMoves.some((m) => m.row === row && m.col === col);
      if (!isValid) {
        setSelected(null);
        setValidMoves([]);
        return;
      }

      const movePayload = {
        fromRow: selected.row,
        fromCol: selected.col,
        toRow: row,
        toCol: col,
      };

      const playMoveSound = (isCapture: boolean) => {
        if (isCapture) playSound("capture");
        else playSound("move");
      };

      if (isMultiplayer && socketRef.current && socketConnected) {
        console.log("Emitting make_move via socket");
        setMakingMove(true);
        if (moveTimeoutRef.current) {
          clearTimeout(moveTimeoutRef.current);
        }
        moveTimeoutRef.current = setTimeout(() => {
          console.warn("Move timeout: fallback to REST");
          fetchGame();
          setMakingMove(false);
          moveTimeoutRef.current = null;
        }, 5000);

        socketRef.current.emit("make_move", {
          gameId: id,
          userId: user?.id,
          ...movePayload,
        });
        return;
      }

      setMakingMove(true);
      api
        .post(`/games/${id}/move`, movePayload)
        .then((res) => {
          const captured = res.data?.move?.isCapture || false;
          playMoveSound(captured);
          fetchGame();
        })
        .catch((err) =>
          alert(
            "Move error: " + (err.response?.data?.message || "Unknown error"),
          ),
        )
        .finally(() => setMakingMove(false));
      return;
    }

    const piece = game.board.board[row]?.[col];
    if (piece && piece.color === game.board.currentTurn) {
      const board = new Board();
      board.setState(game.board.board, game.board.currentTurn);
      if (game.board.multiCapturePiece) {
        (board as any).multiCapturePiece = game.board.multiCapturePiece;
      }
      const allMoves = board.getValidMoves(game.board.currentTurn);
      const captureMoves = allMoves.filter(
        (m) => m.fromRow === row && m.fromCol === col && m.isCapture,
      );
      if (captureMoves.length > 0) {
        const chain = getBestCaptureChain(
          board,
          game.board.currentTurn,
          row,
          col,
        );
        if (chain.length > 0) {
          const firstMove = chain[0];
          if (isMultiplayer && socketRef.current && socketConnected) {
            setMakingMove(true);
            if (moveTimeoutRef.current) {
              clearTimeout(moveTimeoutRef.current);
            }
            moveTimeoutRef.current = setTimeout(() => {
              console.warn("Move timeout: fallback to REST");
              fetchGame();
              setMakingMove(false);
              moveTimeoutRef.current = null;
            }, 5000);
            socketRef.current.emit("make_move", {
              gameId: id,
              userId: user?.id,
              fromRow: firstMove.fromRow,
              fromCol: firstMove.fromCol,
              toRow: firstMove.toRow,
              toCol: firstMove.toCol,
            });
            return;
          }
          setMakingMove(true);
          api
            .post(`/games/${id}/move`, {
              fromRow: firstMove.fromRow,
              fromCol: firstMove.fromCol,
              toRow: firstMove.toRow,
              toCol: firstMove.toCol,
            })
            .then(() => {
              playSound("capture");
              fetchGame();
            })
            .catch((err) =>
              alert(
                "Move error: " +
                  (err.response?.data?.message || "Unknown error"),
              ),
            )
            .finally(() => setMakingMove(false));
          return;
        }
      }
      setSelected({ row, col });
      const targets = allMoves
        .filter((m) => m.fromRow === row && m.fromCol === col)
        .map((m) => ({ row: m.toRow, col: m.toCol }));
      setValidMoves(targets);
    } else {
      setSelected(null);
      setValidMoves([]);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "badge-active";
      case "WHITE_WINS":
        return "badge-white-wins";
      case "BLACK_WINS":
        return "badge-black-wins";
      case "DRAW":
        return "badge-draw";
      default:
        return "badge-active";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
        <p className="text-gray-400 text-sm animate-pulse">Loading game...</p>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <div className="text-5xl">{error ? "😕" : "🔍"}</div>
        <h2 className="text-xl text-red-400">{error || "Game not found"}</h2>
        <button
          onClick={() => navigate("/")}
          className="btn-premium text-sm py-2 px-6"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const isYourTurn =
    game.board.currentTurn === "white" && game.game.status === "ACTIVE";
  const multiPiece = game.board.multiCapturePiece;
  const gameStatus = game.game.status;

  const turnColor = game.board.currentTurn === "white" ? "White" : "Black";

  const whiteAvatarUrl = game.whiteAvatar
    ? `http://localhost:3001${game.whiteAvatar}`
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(game.whiteUsername)}&background=random&size=40&rounded=true`;

  const blackAvatarUrl = game.blackAvatar
    ? `http://localhost:3001${game.blackAvatar}`
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(game.blackUsername)}&background=random&size=40&rounded=true`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 p-4 md:p-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-accent-500/5 rounded-full blur-3xl" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/")}
            className="text-gray-400 hover:text-white transition flex items-center gap-2 glass px-4 py-2 rounded-xl text-sm"
          >
            ← Back
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-white">
            Game{" "}
            <span className="text-gray-400 font-mono">#{id?.slice(0, 8)}</span>
          </h1>
          <span className={`ml-auto ${getStatusBadge(gameStatus)}`}>
            {gameStatus}
          </span>
          {game.game.winnerId && (
            <span className="text-sm text-yellow-400">
              Winner:{" "}
              {game.game.winnerId === game.game.whiteId ? "White" : "Black"}
            </span>
          )}
        </div>

        {/* Player info & avatars */}
        <div className="flex justify-between items-center glass p-3 mb-4">
          <div className="flex items-center gap-3">
            <img
              src={whiteAvatarUrl}
              alt={game.whiteUsername}
              className="w-10 h-10 rounded-full border-2 border-white/20"
            />
            <div>
              <div className="text-sm text-gray-300">White</div>
              <div className="font-semibold text-white">
                {game.whiteUsername}
              </div>
            </div>
          </div>
          <div className="text-center text-xs text-gray-400">
            {turnColor} turn
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm text-gray-300">Black</div>
              <div className="font-semibold text-white">
                {game.blackUsername}
              </div>
            </div>
            <img
              src={blackAvatarUrl}
              alt={game.blackUsername}
              className="w-10 h-10 rounded-full border-2 border-white/20"
            />
          </div>
        </div>

        {isMultiplayer && (
          <div className="glass p-4 mb-4 text-center">
            <p className="text-gray-300 text-sm">
              Share this link with your friend:
              <span className="ml-2 text-yellow-300 font-mono break-all">
                {window.location.href}
              </span>
            </p>
            {game.game.blackId === "WAITING" && (
              <p className="text-blue-300 text-xs mt-1">
                Waiting for opponent to join...
              </p>
            )}
            {game.game.blackId !== "WAITING" && game.game.blackId !== "AI" && (
              <p className="text-green-300 text-xs mt-1">
                Both players are in the game!
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col xl:flex-row gap-8">
          <div className="flex-1 flex flex-col items-center">
            <div className="w-full flex justify-start items-center gap-4 mb-4">
              <label className="text-gray-300 text-sm font-medium">
                Board Theme:
              </label>
              <select
                value={selectedTheme}
                onChange={(e) => handleThemeChange(e.target.value)}
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                <option value="nigerian">Nigerian (Yellow)</option>
                <option value="classic">Classic (Wood)</option>
                <option value="green">Green</option>
                <option value="red">Red</option>
              </select>
            </div>

            {game ? (
              <GameBoard
                key={boardKey}
                board={game.board}
                onSquareClick={handleSquareClick}
                selectedSquare={selected}
                validMoves={validMoves}
                lastMove={lastMove}
                theme={THEMES[selectedTheme]}
              />
            ) : (
              <div className="text-center text-gray-400 py-8">
                Loading board...
              </div>
            )}
          </div>

          <div className="xl:w-80 glass p-6 h-fit sticky top-8">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-lg font-semibold text-white">Move History</h3>
              <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                {game.moves ? game.moves.length : 0} moves
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-1 text-sm custom-scrollbar">
              {!game.moves || game.moves.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No moves yet</p>
              ) : (
                game.moves.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex justify-between items-center px-3 py-2 rounded-lg transition-colors ${idx % 2 === 0 ? "bg-white/5" : "bg-white/3"}`}
                  >
                    <span className="text-gray-500 font-mono text-xs w-8">
                      {idx + 1}.
                    </span>
                    <span className="text-gray-300 font-mono text-sm">
                      {m.fromSquare} → {m.toSquare}
                    </span>
                    {m.capturedPiece && (
                      <span className="text-red-400 text-xs">×</span>
                    )}
                  </div>
                ))
              )}
            </div>

            {isYourTurn && (
              <div className="mt-4 p-3 bg-primary-500/10 border border-primary-500/20 rounded-xl text-primary-300 text-sm text-center animate-glow-pulse">
                {multiPiece ? (
                  autoCapturing ? (
                    <>⏳ Auto‑capturing...</>
                  ) : (
                    <>🎯 Must continue capturing!</>
                  )
                ) : (
                  <>🎯 Your turn ({game.whiteUsername})</>
                )}
              </div>
            )}

            {!isYourTurn && game.game.status === "ACTIVE" && (
              <div className="mt-4 p-3 bg-gray-500/10 border border-gray-500/20 rounded-xl text-gray-400 text-sm text-center">
                Waiting for opponent...
              </div>
            )}

            {makingMove && (
              <div className="mt-3 p-2 bg-white/5 rounded-xl text-center text-gray-400 text-sm">
                <span className="w-4 h-4 border-2 border-primary-400/30 border-t-primary-400 rounded-full inline-block animate-spin mr-2" />
                Processing move...
              </div>
            )}

            {game.game.status !== "ACTIVE" && (
              <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-300 text-sm text-center">
                Game over
              </div>
            )}

            {isMultiplayer && socketRef.current && socketConnected && user && (
              <div className="mt-4">
                <ChatBox
                  socket={socketRef.current}
                  gameId={id!}
                  userId={user.id}
                  username={user.username}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Win/Loss Modal */}
      {game.game.status !== "ACTIVE" && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50">
          <div className="glass p-10 max-w-md text-center animate-scale-in">
            <div className="text-6xl mb-4">
              {game.game.winnerId === game.game.whiteId ? "🎉" : "😢"}
            </div>
            <h2 className="text-3xl font-bold text-white">
              {game.game.winnerId === game.game.whiteId
                ? "Congratulations, you won!"
                : "Try again, you lost!"}
            </h2>
            <p className="text-gray-400 mt-2">
              {game.game.winnerId === game.game.whiteId
                ? "Great strategy!"
                : "Better luck next time."}
            </p>
            <button onClick={() => navigate("/")} className="mt-6 btn-premium">
              Back to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GamePage;
