import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/client";
import { Board, Move } from "../lib/board";
import GameBoard from "../components/GameBoard";

interface RecentGame {
  id: string;
  status: string;
  myColor: "white" | "black";
  opponentUsername: string;
  opponentAvatar: string;
  isAI: boolean;
  result: "WIN" | "LOSS" | "DRAW" | "ONGOING";
  startedAt: string;
}

// Shown at /replay — lets the player pick which past game to watch back.
const ReplayPicker = () => {
  const [games, setGames] = useState<RecentGame[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/users/me/games")
      .then((res) => setGames(res.data.filter((g: RecentGame) => g.result !== "ONGOING")))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 p-8">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white transition mb-6 flex items-center gap-2"
        >
          ← Back to Dashboard
        </button>
        <h1 className="text-3xl font-bold text-white mb-6">🎬 Replays</h1>
        <div className="glass p-6">
          {loading ? (
            <div className="text-gray-400 text-center py-8">Loading…</div>
          ) : games.length === 0 ? (
            <div className="text-gray-400 text-center py-8">
              No finished games yet. Play a game to unlock its replay!
            </div>
          ) : (
            <div className="space-y-2">
              {games.map((g) => (
                <div
                  key={g.id}
                  onClick={() => navigate(`/replay/${g.id}`)}
                  className="flex justify-between items-center p-3 bg-white/5 hover:bg-white/10 rounded-xl transition cursor-pointer"
                >
                  <div className="text-white text-sm">
                    vs {g.opponentUsername}
                    <span className="text-gray-400 ml-2 text-xs">
                      {new Date(g.startedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${
                      g.result === "WIN"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : g.result === "LOSS"
                          ? "bg-red-500/20 text-red-300 border-red-500/30"
                          : "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                    }`}
                  >
                    {g.result}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Shown at /replay/:id — actually plays back a specific game's moves.
const ReplayViewer = ({ id }: { id: string }) => {
  const navigate = useNavigate();
  const [board, setBoard] = useState<any>(null);
  const [moves, setMoves] = useState<any[]>([]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [speed, setSpeed] = useState(1000);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    api
      .get(`/games/${id}`)
      .then((res) => {
        const data = res.data;
        setMoves(data.moves);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.response?.data?.message || "Failed to load game");
        setLoading(false);
      });
  }, [id]);

  // Rebuild the board for the current step and auto-advance while playing.
  useEffect(() => {
    const b = new Board();
    for (let i = 0; i < step; i++) {
      const m = moves[i];
      const from = {
        row: parseInt(m.fromSquare.split("-")[0]),
        col: parseInt(m.fromSquare.split("-")[1]),
      };
      const to = {
        row: parseInt(m.toSquare.split("-")[0]),
        col: parseInt(m.toSquare.split("-")[1]),
      };
      const move = new Move(from.row, from.col, to.row, to.col, m.capturedPiece !== null);
      b.makeMove(move);
    }
    setBoard({ board: b.toJSON().board, currentTurn: b.currentTurn });

    if (playing && moves.length > 0 && step < moves.length) {
      timerRef.current = setTimeout(() => setStep((s) => s + 1), speed);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, moves, playing, speed]);

  const goToStep = (newStep: number) => {
    setPlaying(false);
    setStep(Math.max(0, Math.min(newStep, moves.length)));
  };

  if (loading)
    return <div className="p-8 text-center text-gray-400">Loading replay...</div>;
  if (error) return <div className="p-8 text-center text-red-400">{error}</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate("/replay")}
          className="text-gray-400 hover:text-white transition mb-6 flex items-center gap-2"
        >
          ← All Replays
        </button>
        <h1 className="text-3xl font-bold text-white mb-4">Game Replay</h1>
        <div className="glass p-4 mb-4">
          <div className="flex justify-center">
            {board && <GameBoard boardState={board} onSquareClick={() => {}} selectedSquare={null} validMoves={[]} lastMove={null} />}
          </div>
        </div>
        <div className="glass p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-white text-sm">
              Move {step} / {moves.length}
            </span>
            <button onClick={() => goToStep(0)} className="text-gray-400 hover:text-white text-sm">⏮</button>
            <button onClick={() => goToStep(step - 1)} className="btn-premium text-sm py-1 px-3">◀</button>
            <button
              onClick={() => setPlaying((p) => !p)}
              className="btn-premium text-sm py-1 px-4"
            >
              {playing ? "⏸ Pause" : "▶ Play"}
            </button>
            <button onClick={() => goToStep(step + 1)} className="btn-premium text-sm py-1 px-3">▶</button>
            <button onClick={() => goToStep(moves.length)} className="text-gray-400 hover:text-white text-sm">⏭</button>
            <select
              value={speed}
              onChange={(e) => setSpeed(parseInt(e.target.value))}
              className="ml-auto bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white text-sm"
            >
              <option value={1800}>0.5x</option>
              <option value={1000}>1x</option>
              <option value={500}>2x</option>
              <option value={250}>4x</option>
            </select>
          </div>
          <div className="mt-3 max-h-32 overflow-y-auto leading-7">
            {moves.map((m, idx) => (
              <span
                key={idx}
                onClick={() => goToStep(idx + 1)}
                className={`text-sm cursor-pointer mr-2 px-1.5 py-0.5 rounded ${
                  idx < step ? "text-yellow-300 bg-yellow-500/10" : "text-gray-400 hover:text-white"
                }`}
              >
                {idx + 1}. {m.fromSquare}→{m.toSquare}
                {m.capturedPiece ? " ×" : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const Replay = () => {
  const { id } = useParams<{ id: string }>();
  if (!id) return <ReplayPicker />;
  return <ReplayViewer id={id} />;
};

export default Replay;
