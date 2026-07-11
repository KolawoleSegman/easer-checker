import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { API_BASE_URL } from "../api/client";
import GameBoard, { THEMES } from "../components/GameBoard";
import { Board, Move, type Piece, type PieceColor } from "../lib/board";
import { getSocket } from "../socket";
import ChatBox from "../components/ChatBox";
import { playSound } from "../sounds";

const API_URL = API_BASE_URL;

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

  // ---- State ----
  const [game, setGame] = useState<GameResponse | null>(null);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [validMoves, setValidMoves] = useState<{ row: number; col: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastMove, setLastMove] = useState<{
    from: { row: number; col: number };
    to: { row: number; col: number };
  } | null>(null);
  const [makingMove, setMakingMove] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localBoard, setLocalBoard] = useState<Board | null>(null);
  const [autoCapturing, setAutoCapturing] = useState(false);
  const autoCaptureTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [selectedTheme, setSelectedTheme] = useState(() => {
    const saved = localStorage.getItem("boardTheme");
    return saved && THEMES[saved] ? saved : "nigerian";
  });

  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const socketRef = useRef<any>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [socketConnecting, setSocketConnecting] = useState(true);
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const moveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ---- Chat toggle & unread count ----
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // ---- Track last socket update timestamp and current state hash ----
  const lastUpdateTimestamp = useRef<number>(Date.now());
  const currentGameHash = useRef<string>("");

  // ---- Load user ----
  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
  }, []);

  // ---- Theme handler ----
  const handleThemeChange = (themeKey: string) => {
    setSelectedTheme(themeKey);
    localStorage.setItem("boardTheme", themeKey);
  };

  // ---- Manual refresh ----
  const handleManualRefresh = () => {
    console.log("🔄 Manual refresh triggered");
    fetchGame();
  };

  // ---- Best capture chain (keeps the same for flying kings) ----
  const getBestCaptureChain = (
    board: Board,
    color: PieceColor,
    fromRow: number,
    fromCol: number
  ): Move[] => {
    const allMoves = board.getValidMoves(color);
    const captureMoves = allMoves.filter(
      (m) => m.fromRow === fromRow && m.fromCol === fromCol && m.isCapture
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
              m.isCapture
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

  // ---- Perform auto‑capture chain ----
  const performAutoCaptureChain = async (moves: Move[]) => {
    if (autoCaptureTimerRef.current) {
      clearTimeout(autoCaptureTimerRef.current);
      autoCaptureTimerRef.current = null;
    }

    if (!moves || moves.length === 0) {
      setAutoCapturing(false);
      setIsSubmitting(false);
      return;
    }

    setAutoCapturing(true);
    setIsSubmitting(true);
    console.log(`🔁 Auto‑capture: starting chain of ${moves.length} moves`);

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      console.log(`🔄 Step ${i+1}/${moves.length}: (${move.fromRow},${move.fromCol}) → (${move.toRow},${move.toCol})`);

      try {
        await Promise.race([
          api.post(`/games/${id}/move`, {
            fromRow: move.fromRow,
            fromCol: move.fromCol,
            toRow: move.toRow,
            toCol: move.toCol,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Move timeout")), 5000)
          )
        ]);

        console.log(`✅ Step ${i+1} succeeded`);
        await new Promise(resolve => setTimeout(resolve, 150));
        await fetchGame();
      } catch (err) {
        console.error(`❌ Auto‑capture step ${i+1} failed:`, err);
        // On failure, refresh the board state and break the chain
        await fetchGame();
        setSelected(null);
        setValidMoves([]);
        break;
      }
    }

    setAutoCapturing(false);
    setIsSubmitting(false);
    console.log("✅ Auto‑capture chain completed");
  };

  // ---- fetchGame with diff check ----
  const fetchGame = async () => {
    try {
      const res = await api.get(`/games/${id}`);
      const data: GameResponse = res.data;

      const newHash = JSON.stringify({
        board: data.board.board,
        currentTurn: data.board.currentTurn,
        movesLength: data.moves.length,
        status: data.game.status,
      });

      if (newHash === currentGameHash.current) {
        console.log("⏭️ No change in game state, skipping update");
        return;
      }

      console.log("📥 Updating game state from REST (hash changed)");
      currentGameHash.current = newHash;

      setGame(data);

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
        if (data.game.winnerId === data.game.whiteId) playSound("win");
        else if (data.game.winnerId === data.game.blackId) playSound("lose");
      }

      setLoading(false);
    } catch (err: any) {
      console.error("fetchGame error:", err);
      setError(err.response?.data?.message || "Failed to load game");
      setLoading(false);
    }
  };

  // ---- Initial fetch ----
  useEffect(() => {
    if (id) fetchGame();
  }, [id]);

  // ---- Detect multiplayer ----
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
      console.log("✅ Socket connected");
      setSocketConnected(true);
      setSocketConnecting(false);
      socket.emit("join_room", { gameId: id, userId: user.id });
    };

    const onDisconnect = () => {
      console.log("❌ Socket disconnected");
      setSocketConnected(false);
      setSocketConnecting(false);
    };

    const onReconnect = () => {
      console.log("🔄 Socket reconnected");
      setSocketConnected(true);
      socket.emit("join_room", { gameId: id, userId: user.id });
    };

    const onGameState = (data: any) => {
      if (!data || !data.moves) return;
      console.log(`📩 game_state received at ${new Date().toISOString()}`, data);
      lastUpdateTimestamp.current = Date.now();

      const newHash = JSON.stringify({
        board: data.board.board,
        currentTurn: data.board.currentTurn,
        movesLength: data.moves.length,
        status: data.game.status,
      });
      if (newHash === currentGameHash.current) {
        console.log("⏭️ Socket state unchanged, skipping update");
        return;
      }
      currentGameHash.current = newHash;

      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
        moveTimeoutRef.current = null;
      }

      setGame(data);
      setMakingMove(false);
      setIsSubmitting(false);

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
        if (data.game.winnerId === data.game.whiteId) playSound("win");
        else if (data.game.winnerId === data.game.blackId) playSound("lose");
      }
    };

    const onGameOver = (data: any) => {
      if (data) setGame(data);
      setMakingMove(false);
      setIsSubmitting(false);
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
        moveTimeoutRef.current = null;
      }
    };

    const onError = (err: any) => {
      console.error("Socket error:", err);
      setMakingMove(false);
      setIsSubmitting(false);
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
        moveTimeoutRef.current = null;
      }
      // On socket error, refresh game state to recover
      fetchGame();
      setSelected(null);
      setValidMoves([]);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("reconnect", onReconnect);
    socket.on("game_state", onGameState);
    socket.on("game_over", onGameOver);
    socket.on("error", onError);

    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("reconnect", onReconnect);
      socket.off("game_state", onGameState);
      socket.off("game_over", onGameOver);
      socket.off("error", onError);
    };
  }, [isMultiplayer, game, user, id]);

  // ---- Fallback polling (every 5 seconds) ----
  useEffect(() => {
    if (!game || game.game.status !== "ACTIVE") return;

    const interval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateTimestamp.current;
      if (!socketConnected || timeSinceLastUpdate > 5000) {
        console.log(`⏰ Fallback: ${timeSinceLastUpdate}ms since last update → fetching via REST`);
        fetchGame();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [game, socketConnected]);

  // ---- Increment unread count on chat messages when chat is closed ----
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const onChatMessage = () => {
      if (!chatOpen) {
        setUnreadCount(prev => prev + 1);
      }
    };

    socket.on("chat_message", onChatMessage);
    socket.on("voice_message", onChatMessage);

    return () => {
      socket.off("chat_message", onChatMessage);
      socket.off("voice_message", onChatMessage);
    };
  }, [socketRef.current, chatOpen]);

  // ---- Toggle chat ----
  const toggleChat = () => {
    setChatOpen(prev => !prev);
    if (!chatOpen) {
      setUnreadCount(0); // Reset unread when opening
    }
  };

  // ---- Handle square click (with error recovery) ----
  const handleSquareClick = (row: number, col: number) => {
    if (!game || game.game.status !== "ACTIVE" || makingMove || autoCapturing || isSubmitting) return;

    const multiPiece = game.board.multiCapturePiece;
    if (multiPiece) return;

    const isWhite = game.game.whiteId === user?.id;
    const isBlack = game.game.blackId === user?.id;
    const playerColor = isWhite ? "white" : isBlack ? "black" : null;

    if (playerColor !== game.board.currentTurn) return;

    const piece = game.board.board[row]?.[col];

    if (!selected) {
      if (!piece || piece.color !== playerColor) return;

      const board = new Board();
      board.setState(game.board.board, game.board.currentTurn);
      if (game.board.multiCapturePiece) {
        (board as any).multiCapturePiece = game.board.multiCapturePiece;
      }
      const allMoves = board.getValidMoves(game.board.currentTurn);
      const targets = allMoves
        .filter((m) => m.fromRow === row && m.fromCol === col)
        .map((m) => ({ row: m.toRow, col: m.toCol }));

      if (targets.length === 0) return;

      setSelected({ row, col });
      setValidMoves(targets);
      return;
    }

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

    const board = new Board();
    board.setState(game.board.board, game.board.currentTurn);
    if (game.board.multiCapturePiece) {
      (board as any).multiCapturePiece = game.board.multiCapturePiece;
    }
    const allMoves = board.getValidMoves(game.board.currentTurn);
    const chosenMove = allMoves.find(
      (m) => m.fromRow === selected.row && m.fromCol === selected.col && m.toRow === row && m.toCol === col
    );
    if (!chosenMove) return;

    // If capture, try to auto‑capture chain
    if (chosenMove.isCapture) {
      const chain = getBestCaptureChain(
        board,
        game.board.currentTurn,
        selected.row,
        selected.col
      );
      if (chain.length > 0) {
        setSelected(null);
        setValidMoves([]);
        performAutoCaptureChain(chain);
        return;
      }
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

    // ---- Multiplayer via socket ----
    if (isMultiplayer && socketRef.current && socketConnected) {
      setMakingMove(true);
      setIsSubmitting(true);
      if (moveTimeoutRef.current) clearTimeout(moveTimeoutRef.current);
      moveTimeoutRef.current = setTimeout(() => {
        console.warn("⏰ Move timeout – fallback to REST");
        fetchGame();
        setMakingMove(false);
        setIsSubmitting(false);
        setSelected(null);
        setValidMoves([]);
        moveTimeoutRef.current = null;
      }, 5000);

      socketRef.current.emit("make_move", {
        gameId: id,
        userId: user?.id,
        ...movePayload,
      }, (response: any) => {
        // Optional callback to handle response/error from server
        if (response && response.error) {
          console.error("Socket move error:", response.error);
          setMakingMove(false);
          setIsSubmitting(false);
          fetchGame();
          setSelected(null);
          setValidMoves([]);
        }
      });
      // Refresh optimistically; the socket will also push state
      setTimeout(() => fetchGame(), 200);
      return;
    }

    // ---- AI or local (REST) move ----
    setMakingMove(true);
    setIsSubmitting(true);
    api
      .post(`/games/${id}/move`, movePayload)
      .then((res) => {
        const captured = res.data?.move?.isCapture || false;
        playMoveSound(captured);
        fetchGame();
      })
      .catch((err) => {
        console.error("REST move error:", err);
        alert("Move error: " + (err.response?.data?.message || "Unknown error"));
        // Refresh board to recover
        fetchGame();
        setSelected(null);
        setValidMoves([]);
      })
      .finally(() => {
        setMakingMove(false);
        setIsSubmitting(false);
      });
  };

  // ---- Status badge ----
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE": return "badge-active";
      case "WHITE_WINS": return "badge-white-wins";
      case "BLACK_WINS": return "badge-black-wins";
      case "DRAW": return "badge-draw";
      default: return "badge-active";
    }
  };

  // ---- Render ----
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
        <button onClick={() => navigate("/")} className="btn-premium text-sm py-2 px-6">
          Back to Dashboard
        </button>
      </div>
    );
  }

  const isYourTurn = game.board.currentTurn === "white" && game.game.status === "ACTIVE";
  const multiPiece = game.board.multiCapturePiece;
  const gameStatus = game.game.status;
  const turnColor = game.board.currentTurn === "white" ? "White" : "Black";

  const userColor = game.game.whiteId === user?.id ? "white" : game.game.blackId === user?.id ? "black" : null;

  const whiteAvatarUrl = game.whiteAvatar
    ? `${API_URL}${game.whiteAvatar}`
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(game.whiteUsername)}&background=random&size=40&rounded=true`;
  const blackAvatarUrl = game.blackAvatar
    ? `${API_URL}${game.blackAvatar}`
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(game.blackUsername)}&background=random&size=40&rounded=true`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 p-4 md:p-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-accent-500/5 rounded-full blur-3xl" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button onClick={() => navigate("/")} className="text-gray-400 hover:text-white transition flex items-center gap-2 glass px-4 py-2 rounded-xl text-sm">
            ← Back
          </button>
          <button onClick={handleManualRefresh} className="text-gray-300 hover:text-white transition flex items-center gap-2 glass px-4 py-2 rounded-xl text-sm" title="Refresh game state">
            🔄 Refresh
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-white">
            Game <span className="text-gray-400 font-mono">#{id?.slice(0, 8)}</span>
          </h1>
          <span className={`ml-auto ${getStatusBadge(gameStatus)}`}>{gameStatus}</span>
          {game.game.winnerId && (
            <span className="text-sm text-yellow-400">
              Winner: {game.game.winnerId === game.game.whiteId ? "White" : "Black"}
            </span>
          )}
        </div>

        <div className="flex justify-between items-center glass p-3 mb-4">
          <div className="flex items-center gap-3">
            <img src={whiteAvatarUrl} alt={game.whiteUsername} className="w-10 h-10 rounded-full border-2 border-white/20" />
            <div>
              <div className="text-sm text-gray-300">White</div>
              <div className="font-semibold text-white">{game.whiteUsername}</div>
            </div>
          </div>
          <div className="text-center text-xs text-gray-400">{turnColor} turn</div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm text-gray-300">Black</div>
              <div className="font-semibold text-white">{game.blackUsername}</div>
            </div>
            <img src={blackAvatarUrl} alt={game.blackUsername} className="w-10 h-10 rounded-full border-2 border-white/20" />
          </div>
        </div>

        {isMultiplayer && (
          <div className="glass p-4 mb-4 text-center">
            <p className="text-gray-300 text-sm">
              Share this link with your friend:
              <span className="ml-2 text-yellow-300 font-mono break-all">{window.location.href}</span>
            </p>
            {game.game.blackId === "WAITING" && (
              <p className="text-blue-300 text-xs mt-1">Waiting for opponent to join...</p>
            )}
            {game.game.blackId !== "WAITING" && game.game.blackId !== "AI" && (
              <p className="text-green-300 text-xs mt-1">Both players are in the game!</p>
            )}
            {!socketConnected && (
              <p className="text-yellow-300 text-xs mt-1">⚠️ Connecting to game server...</p>
            )}
          </div>
        )}

        <div className="flex flex-col xl:flex-row gap-8">
          <div className="flex-1 flex flex-col items-center">
            <div className="w-full flex justify-start items-center gap-4 mb-4">
              <label className="text-gray-300 text-sm font-medium">Board Theme:</label>
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
              <>
                <GameBoard
                  boardState={game.board}
                  onSquareClick={handleSquareClick}
                  selectedSquare={selected}
                  validMoves={validMoves}
                  lastMove={lastMove}
                  theme={THEMES[selectedTheme]}
                  flip={userColor === 'black'}
                />

                {/* 🔴 Deep red horizontal line – demarcation between board and side panel */}
                <div className="w-full max-w-[600px] flex justify-center mt-4">
                  <hr className="w-4/5 border-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-red-700/80 to-transparent" />
                </div>
              </>
            ) : (
              <div className="text-center text-gray-400 py-8">Loading board...</div>
            )}
          </div>

          {/* Side panel – only chat (move history removed) */}
          <div className="xl:w-80 glass p-6 h-fit sticky top-8">
            {isYourTurn && (
              <div className="mb-4 p-3 bg-primary-500/10 border border-primary-500/20 rounded-xl text-primary-300 text-sm text-center animate-glow-pulse">
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
              <div className="mb-4 p-3 bg-gray-500/10 border border-gray-500/20 rounded-xl text-gray-400 text-sm text-center">
                Waiting for opponent...
              </div>
            )}

            {makingMove && (
              <div className="mb-4 p-2 bg-white/5 rounded-xl text-center text-gray-400 text-sm">
                <span className="w-4 h-4 border-2 border-primary-400/30 border-t-primary-400 rounded-full inline-block animate-spin mr-2" />
                Processing move...
              </div>
            )}

            {game.game.status !== "ACTIVE" && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-300 text-sm text-center">
                Game over
              </div>
            )}

            {/* Chat toggle and component */}
            {isMultiplayer && socketRef.current && socketConnected && user && (
              <div className="mt-4">
                <button
                  onClick={toggleChat}
                  className="flex items-center gap-2 text-gray-300 hover:text-white transition w-full justify-center py-2 bg-white/5 rounded-lg"
                >
                  <span>💬 Chat</span>
                  {!chatOpen && unreadCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
                      {unreadCount}
                    </span>
                  )}
                </button>
                {chatOpen && (
                  <div className="mt-2">
                    <ChatBox
                      socket={socketRef.current}
                      gameId={id!}
                      userId={user.id}
                      username={user.username}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

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
