import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { API_BASE_URL } from "../api/client";
import GameBoard, { THEMES } from "../components/GameBoard";
import { Board, Move, type Piece, type PieceColor } from "../lib/board";
import { getSocket } from "../socket";
import ChatBox from "../components/ChatBox";
import { playSound, preloadSounds } from "../sounds";

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

type Square = { row: number; col: number };

const boardFromState = (state: BoardState): Board => {
  const board = new Board();
  board.setState(state.board, state.currentTurn);
  if (state.multiCapturePiece) {
    (board as any).multiCapturePiece = state.multiCapturePiece;
  }
  return board;
};

/**
 * Longest capture sequence that starts with `first` (the move the player
 * actually clicked). Further jumps are forced anyway, so we follow whichever
 * continuation captures the most pieces.
 */
const buildCaptureChain = (board: Board, color: PieceColor, first: Move): Move[] => {
  const walk = (b: Board, depth: number): Move[] => {
    if (depth > 40 || !b.isMultiCaptureInProgress()) return [];
    const forced = b.getMultiCapturePiece();
    if (!forced) return [];
    const nexts = b
      .getValidMoves(color)
      .filter((m) => m.fromRow === forced.row && m.fromCol === forced.col && m.isCapture);
    let best: Move[] = [];
    for (const m of nexts) {
      const tail = [m, ...walk(b.makeMove(m), depth + 1)];
      if (tail.length > best.length) best = tail;
    }
    return best;
  };
  return [first, ...walk(board.makeMove(first), 0)];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Component ---
const GamePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const user = useMemo<{ id: string; username: string } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }, []);

  // ---- State ----
  const [game, setGame] = useState<GameResponse | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [validMoves, setValidMoves] = useState<Square[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissedOver, setDismissedOver] = useState(false);
  const [copied, setCopied] = useState(false);

  const [selectedTheme, setSelectedTheme] = useState(() => {
    const saved = localStorage.getItem("boardTheme");
    return saved && THEMES[saved] ? saved : "nigerian";
  });

  const [socketConnected, setSocketConnected] = useState(false);
  const [chatSocket, setChatSocket] = useState<any>(null);
  const socketRef = useRef<any>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // ---- Refs: latest values for use inside async callbacks ----
  const gameRef = useRef<GameResponse | null>(null);
  const busyRef = useRef(false);
  const confirmedRef = useRef(0); // number of server-confirmed moves we have applied
  const soundedRef = useRef(0); // number of moves we've already played a sound for
  const optimisticRef = useRef(false); // local board is ahead of the server
  const endSoundRef = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;

  useEffect(() => {
    preloadSounds();
  }, []);

  const showNotice = (msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
  };

  const setBusyBoth = (v: boolean) => {
    busyRef.current = v;
    setBusy(v);
  };

  // ---- Derived info ----
  const isMultiplayer = !!game && game.game.blackId !== "AI";
  const isAI = !!game && game.game.blackId === "AI";
  const userColor: PieceColor | null = !game
    ? null
    : game.game.whiteId === user?.id
      ? "white"
      : game.game.blackId === user?.id
        ? "black"
        : null;

  // ---- Apply authoritative state from the server (REST or socket) ----
  const applyState = (data: any) => {
    if (!data || !data.game || !data.board) return;
    const moves: MoveRecord[] = Array.isArray(data.moves) ? data.moves : [];
    const grid = Array.isArray(data.board.board) ? data.board.board : null;
    if (!grid) return;

    const prev = gameRef.current;

    // Ignore stale snapshots (e.g. a slow GET answering after a newer push).
    if (moves.length < confirmedRef.current) return;

    // Nothing new? Skip the re-render entirely (cheap checks, no JSON.stringify).
    if (
      prev &&
      !optimisticRef.current &&
      moves.length === prev.moves.length &&
      prev.game.status === data.game.status &&
      prev.game.blackId === data.game.blackId &&
      prev.board.currentTurn === data.board.currentTurn &&
      prev.blackUsername === data.blackUsername &&
      prev.whiteAvatar === data.whiteAvatar &&
      prev.blackAvatar === data.blackAvatar
    ) {
      return;
    }

    const safe: GameResponse = {
      game: data.game,
      board: {
        board: grid,
        currentTurn: data.board.currentTurn,
        multiCapturePiece: data.board.multiCapturePiece ?? null,
      },
      moves,
      whiteUsername: data.whiteUsername,
      blackUsername: data.blackUsername,
      whiteAvatar: data.whiteAvatar || "",
      blackAvatar: data.blackAvatar || "",
    };

    // Sounds: only for moves we haven't already played a sound for.
    if (prev) {
      const fresh = moves.slice(soundedRef.current);
      if (fresh.length > 0) {
        playSound(fresh.some((m) => m.capturedPiece) ? "capture" : "move");
      }
    }
    soundedRef.current = moves.length;
    confirmedRef.current = moves.length;
    optimisticRef.current = false;
    gameRef.current = safe;
    setGame(safe);

    if (moves.length > 0) {
      const last = moves[moves.length - 1];
      const [fr, fc] = last.fromSquare.split("-").map(Number);
      const [tr, tc] = last.toSquare.split("-").map(Number);
      setLastMove({ from: { row: fr, col: fc }, to: { row: tr, col: tc } });
    } else {
      setLastMove(null);
    }

    // Forced multi-capture for the player to move: pre-select that piece.
    const forced = safe.board.multiCapturePiece;
    const myColor =
      safe.game.whiteId === user?.id
        ? "white"
        : safe.game.blackId === user?.id
          ? "black"
          : null;
    if (forced && myColor === safe.board.currentTurn && safe.game.status === "ACTIVE") {
      const b = boardFromState(safe.board);
      setSelected({ row: forced.row, col: forced.col });
      setValidMoves(
        b
          .getValidMoves(safe.board.currentTurn)
          .filter((m) => m.fromRow === forced.row && m.fromCol === forced.col)
          .map((m) => ({ row: m.toRow, col: m.toCol })),
      );
    } else {
      setSelected(null);
      setValidMoves([]);
    }

    if (safe.game.status !== "ACTIVE" && !endSoundRef.current) {
      endSoundRef.current = true;
      if (myColor) {
        const iWon =
          (safe.game.status === "WHITE_WINS" && myColor === "white") ||
          (safe.game.status === "BLACK_WINS" && myColor === "black");
        if (safe.game.status !== "DRAW") playSound(iWon ? "win" : "lose");
      }
    }

    setLoading(false);
  };

  // ---- Load from REST ----
  const fetchGame = async () => {
    try {
      const res = await api.get(`/games/${id}`);
      applyState(res.data);
      setError("");
      setLoading(false);
    } catch (err: any) {
      if (!gameRef.current) {
        setError(err.response?.data?.message || "Failed to load game");
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ---- Socket: connect once per game, push-driven updates ----
  useEffect(() => {
    if (!isMultiplayer || !id) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    const socket = getSocket(token);
    socketRef.current = socket;
    setChatSocket(socket);

    const join = () => socket.emit("join_room", { gameId: id });
    const onConnect = () => {
      setSocketConnected(true);
      join();
    };
    const onDisconnect = () => setSocketConnected(false);
    const onGameState = (data: any) => applyState(data);
    const onMoveError = (e: any) => {
      showNotice(e?.message || "Move rejected");
      setBusyBoth(false);
      fetchGame();
    };
    const onError = (e: any) => {
      if (e?.message) showNotice(e.message);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("game_state", onGameState);
    socket.on("move_error", onMoveError);
    socket.on("error", onError);

    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("game_state", onGameState);
      socket.off("move_error", onMoveError);
      socket.off("error", onError);
      if (socket.connected) socket.emit("leave_room", { gameId: id });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiplayer, id]);

  // ---- Safety net: poll only if the socket is down (not on every game) ----
  useEffect(() => {
    if (!isMultiplayer || socketConnected || game?.game.status !== "ACTIVE") return;
    const t = setInterval(fetchGame, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiplayer, socketConnected, game?.game.status, id]);

  // ---- Unread chat badge ----
  useEffect(() => {
    if (!chatSocket) return;
    const onMsg = (m: any) => {
      if (!chatOpenRef.current && m?.userId !== user?.id) {
        setUnreadCount((n) => n + 1);
      }
    };
    chatSocket.on("chat_message", onMsg);
    chatSocket.on("voice_message", onMsg);
    return () => {
      chatSocket.off("chat_message", onMsg);
      chatSocket.off("voice_message", onMsg);
    };
  }, [chatSocket, user?.id]);

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  const toggleChat = () => {
    setChatOpen((open) => {
      if (!open) setUnreadCount(0);
      return !open;
    });
  };

  const handleThemeChange = (themeKey: string) => {
    setSelectedTheme(themeKey);
    localStorage.setItem("boardTheme", themeKey);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showNotice("Couldn't copy — select the link and copy it manually");
    }
  };

  // ---- Sending moves ----
  /** Show the move on our own board immediately, before the server answers. */
  const applyOptimistic = (board: Board, move: Move): Board => {
    const next = board.makeMove(move);
    const current = gameRef.current;
    if (current) {
      const optimistic: GameResponse = { ...current, board: next.toJSON() };
      gameRef.current = optimistic;
      setGame(optimistic);
    }
    optimisticRef.current = true;
    setLastMove({
      from: { row: move.fromRow, col: move.fromCol },
      to: { row: move.toRow, col: move.toCol },
    });
    playSound(move.isCapture ? "capture" : "move");
    soundedRef.current = confirmedRef.current + 1;
    setSelected(null);
    setValidMoves([]);
    return next;
  };

  const sendToServer = (move: Move): Promise<void> =>
    new Promise((resolve, reject) => {
      const payload = {
        fromRow: move.fromRow,
        fromCol: move.fromCol,
        toRow: move.toRow,
        toCol: move.toCol,
      };
      const socket = socketRef.current;
      if (isMultiplayer && socket && socket.connected) {
        // The ack arrives after the server has committed (and broadcast) the move.
        socket
          .timeout(8000)
          .emit("make_move", { gameId: id, ...payload }, (err: any, res: any) => {
            if (err) reject(new Error("The server took too long to answer"));
            else if (res?.error) reject(new Error(res.error));
            else resolve();
          });
      } else {
        api
          .post(`/games/${id}/move`, payload)
          .then((res) => {
            applyState(res.data);
            resolve();
          })
          .catch((err) =>
            reject(new Error(err.response?.data?.message || "Move failed")),
          );
      }
    });

  const playMoves = async (chain: Move[], startBoard: Board) => {
    setBusyBoth(true);
    let board = startBoard;
    try {
      for (let i = 0; i < chain.length; i++) {
        board = applyOptimistic(board, chain[i]);
        await sendToServer(chain[i]);
        if (i < chain.length - 1) await sleep(120); // let the jump be seen
      }
    } catch (e: any) {
      showNotice(e?.message || "Move failed");
      optimisticRef.current = true; // force the refresh below to replace the local board
      await fetchGame();
    } finally {
      setBusyBoth(false);
    }
  };

  // ---- Handle square click ----
  const handleSquareClick = (row: number, col: number) => {
    const current = gameRef.current;
    if (!current || !user) return;
    if (current.game.status !== "ACTIVE" || busyRef.current) return;
    if (current.game.blackId === "WAITING") return;

    const color = userColor;
    if (!color || color !== current.board.currentTurn) return;

    const board = boardFromState(current.board);
    const piece = current.board.board[row]?.[col] ?? null;
    const forced = current.board.multiCapturePiece;

    // Choose / change the piece
    if (!selected) {
      if (!piece || piece.color !== color) return;
      const targets = board
        .getValidMoves(color)
        .filter((m) => m.fromRow === row && m.fromCol === col)
        .map((m) => ({ row: m.toRow, col: m.toCol }));
      if (targets.length === 0) return;
      setSelected({ row, col });
      setValidMoves(targets);
      return;
    }

    if (selected.row === row && selected.col === col) {
      if (forced) return; // can't deselect a piece that must keep capturing
      setSelected(null);
      setValidMoves([]);
      return;
    }

    // Clicking another of your own pieces switches selection (when allowed)
    if (!forced && piece && piece.color === color) {
      const targets = board
        .getValidMoves(color)
        .filter((m) => m.fromRow === row && m.fromCol === col)
        .map((m) => ({ row: m.toRow, col: m.toCol }));
      if (targets.length > 0) {
        setSelected({ row, col });
        setValidMoves(targets);
      } else {
        setSelected(null);
        setValidMoves([]);
      }
      return;
    }

    if (!validMoves.some((m) => m.row === row && m.col === col)) {
      if (!forced) {
        setSelected(null);
        setValidMoves([]);
      }
      return;
    }

    const chosen = board
      .getValidMoves(color)
      .find(
        (m) =>
          m.fromRow === selected.row &&
          m.fromCol === selected.col &&
          m.toRow === row &&
          m.toCol === col,
      );
    if (!chosen) return;

    const chain = chosen.isCapture ? buildCaptureChain(board, color, chosen) : [chosen];
    void playMoves(chain, board);
  };

  // ---- Render helpers ----
  const getStatusBadge = (status: string) => {
    switch (status) {
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
        <button onClick={() => navigate("/")} className="btn-premium text-sm py-2 px-6">
          Back to Dashboard
        </button>
      </div>
    );
  }

  const gameStatus = game.game.status;
  const isActive = gameStatus === "ACTIVE";
  const waitingForOpponent = game.game.blackId === "WAITING";
  const multiPiece = game.board.multiCapturePiece;
  const turnColor = game.board.currentTurn === "white" ? "White" : "Black";
  const isYourTurn =
    isActive && !waitingForOpponent && !!userColor && userColor === game.board.currentTurn;
  const opponentName =
    userColor === "white" ? game.blackUsername : userColor === "black" ? game.whiteUsername : "";

  const iWon =
    (gameStatus === "WHITE_WINS" && userColor === "white") ||
    (gameStatus === "BLACK_WINS" && userColor === "black");
  const winnerName =
    gameStatus === "WHITE_WINS" ? game.whiteUsername : gameStatus === "BLACK_WINS" ? game.blackUsername : "";

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
          <button
            onClick={() => navigate("/")}
            className="text-gray-400 hover:text-white transition flex items-center gap-2 glass px-4 py-2 rounded-xl text-sm"
          >
            ← Back
          </button>
          <button
            onClick={fetchGame}
            className="text-gray-300 hover:text-white transition flex items-center gap-2 glass px-4 py-2 rounded-xl text-sm"
            title="Refresh game state"
          >
            🔄 Refresh
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-white">
            Game <span className="text-gray-400 font-mono">#{id?.slice(0, 8)}</span>
          </h1>
          <span className={`ml-auto ${getStatusBadge(gameStatus)}`}>{gameStatus}</span>
          {winnerName && (
            <span className="text-sm text-yellow-400">Winner: {winnerName}</span>
          )}
        </div>

        {notice && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200 text-sm text-center">
            {notice}
          </div>
        )}

        <div className="flex justify-between items-center glass p-3 mb-4">
          <div className="flex items-center gap-3">
            <img
              src={whiteAvatarUrl}
              alt={game.whiteUsername}
              className="w-10 h-10 rounded-full border-2 border-white/20"
            />
            <div>
              <div className="text-sm text-gray-300">White</div>
              <div className="font-semibold text-white">{game.whiteUsername}</div>
            </div>
          </div>
          <div className="text-center text-xs text-gray-400">
            {isActive ? `${turnColor} turn` : "Game over"}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm text-gray-300">Black</div>
              <div className="font-semibold text-white">{game.blackUsername}</div>
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
              <button
                onClick={copyLink}
                className="ml-3 px-3 py-1 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </p>
            {waitingForOpponent ? (
              <p className="text-blue-300 text-xs mt-1">Waiting for opponent to join...</p>
            ) : (
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

            <GameBoard
              boardState={game.board}
              onSquareClick={handleSquareClick}
              selectedSquare={selected}
              validMoves={validMoves}
              lastMove={lastMove}
              theme={THEMES[selectedTheme]}
              flip={userColor === "black"}
            />

            <div className="w-full max-w-[600px] flex justify-center mt-4">
              <hr className="w-4/5 border-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-red-700/80 to-transparent" />
            </div>
          </div>

          <div className="xl:w-80 glass p-6 h-fit xl:sticky xl:top-8">
            {waitingForOpponent && isActive && (
              <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-300 text-sm text-center">
                ⏳ Waiting for an opponent to join...
              </div>
            )}

            {isYourTurn && (
              <div className="mb-4 p-3 bg-primary-500/10 border border-primary-500/20 rounded-xl text-primary-300 text-sm text-center animate-glow-pulse">
                {multiPiece ? "🎯 Must continue capturing!" : "🎯 Your turn"}
              </div>
            )}

            {isActive && !waitingForOpponent && !isYourTurn && userColor && (
              <div className="mb-4 p-3 bg-gray-500/10 border border-gray-500/20 rounded-xl text-gray-400 text-sm text-center">
                {isAI ? "🤖 AI is thinking..." : `Waiting for ${opponentName || "opponent"}...`}
              </div>
            )}

            {isActive && !userColor && !waitingForOpponent && (
              <div className="mb-4 p-3 bg-gray-500/10 border border-gray-500/20 rounded-xl text-gray-300 text-sm text-center">
                👀 Watching — {turnColor} to move
              </div>
            )}

            {busy && isYourTurn === false && !isAI && (
              <div className="mb-4 p-2 bg-white/5 rounded-xl text-center text-gray-400 text-sm">
                <span className="w-4 h-4 border-2 border-primary-400/30 border-t-primary-400 rounded-full inline-block animate-spin mr-2" />
                Sending move...
              </div>
            )}

            {!isActive && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-300 text-sm text-center">
                Game over
                {dismissedOver && (
                  <button
                    onClick={() => navigate(`/replay/${id}`)}
                    className="block mx-auto mt-2 text-xs underline text-yellow-200"
                  >
                    Watch replay
                  </button>
                )}
              </div>
            )}

            {/* Chat stays mounted (just hidden) so messages sent while it's
                closed aren't lost. */}
            {isMultiplayer && chatSocket && socketConnected && user && (
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
                <div className={chatOpen ? "mt-2" : "hidden"}>
                  <ChatBox
                    socket={chatSocket}
                    gameId={id!}
                    userId={user.id}
                    username={user.username}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {!isActive && !dismissedOver && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50">
          <div className="glass p-10 max-w-md text-center animate-scale-in">
            <div className="text-6xl mb-4">
              {gameStatus === "DRAW" ? "🤝" : userColor ? (iWon ? "🎉" : "😢") : "🏁"}
            </div>
            <h2 className="text-3xl font-bold text-white">
              {gameStatus === "DRAW"
                ? "It's a draw!"
                : userColor
                  ? iWon
                    ? "Congratulations, you won!"
                    : "Try again, you lost!"
                  : `${winnerName || "Someone"} won the game`}
            </h2>
            <p className="text-gray-400 mt-2">
              {gameStatus === "DRAW"
                ? "Neither side could make progress."
                : userColor
                  ? iWon
                    ? "Great strategy!"
                    : "Better luck next time."
                  : "Game over."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              <button onClick={() => navigate("/")} className="btn-premium">
                Back to Dashboard
              </button>
              <button
                onClick={() => setDismissedOver(true)}
                className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
              >
                View board
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GamePage;
