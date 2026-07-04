import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/client";
import { Board, Move } from "../lib/board";
import GameBoard from "../components/GameBoard";

const Replay = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [board, setBoard] = useState<any>(null);
  const [moves, setMoves] = useState<any[]>([]);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    api
      .get(`/games/${id}`)
      .then((res) => {
        const data = res.data;
        setMoves(data.moves);
        setBoard(data.board);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.response?.data?.message || "Failed to load game");
        setLoading(false);
      });
  }, [id]);

  // Animate replay
  useEffect(() => {
    if (!moves.length) return;
    if (step >= moves.length) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    // Build board from first 'step' moves
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
      const move = new Move(
        from.row,
        from.col,
        to.row,
        to.col,
        m.capturedPiece !== null,
      );
      b.makeMove(move);
    }
    setBoard({ board: b.toJSON().board, currentTurn: b.currentTurn });

    // Auto advance
    timerRef.current = setTimeout(() => {
      setStep((s) => s + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [step, moves]);

  const goToStep = (newStep: number) => {
    setStep(Math.max(0, Math.min(newStep, moves.length)));
  };

  if (loading)
    return (
      <div className="p-8 text-center text-gray-400">Loading replay...</div>
    );
  if (error) return <div className="p-8 text-center text-red-400">{error}</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white transition mb-6 flex items-center gap-2"
        >
          ← Back to Dashboard
        </button>
        <h1 className="text-3xl font-bold text-white mb-4">Game Replay</h1>
        <div className="glass p-4 mb-4">
          <div className="flex justify-center">
            {board && <GameBoard board={board} />}
          </div>
        </div>
        <div className="glass p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-white">
              Step: {step} / {moves.length}
            </span>
            <button
              onClick={() => goToStep(step - 1)}
              className="btn-premium text-sm py-1 px-3"
            >
              ◀
            </button>
            <button
              onClick={() => goToStep(step + 1)}
              className="btn-premium text-sm py-1 px-3"
            >
              ▶
            </button>
            <button
              onClick={() => goToStep(0)}
              className="text-gray-400 text-sm"
            >
              ⏮
            </button>
            <button
              onClick={() => goToStep(moves.length)}
              className="text-gray-400 text-sm"
            >
              ⏭
            </button>
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto">
            {moves.map((m, idx) => (
              <span
                key={idx}
                className={`text-sm ${idx < step ? "text-yellow-300" : "text-gray-400"} mr-2`}
              >
                {idx + 1}. {m.fromSquare}→{m.toSquare}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Replay;
