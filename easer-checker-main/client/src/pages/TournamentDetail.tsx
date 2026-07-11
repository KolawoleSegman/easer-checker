import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/client";

interface Player {
  userId: string;
  username: string;
  status: "ACTIVE" | "ELIMINATED" | "WINNER";
}

interface Match {
  id: string;
  round: number;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  gameId: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
}

interface TournamentDetailData {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  status: "WAITING" | "ACTIVE" | "FINISHED";
  maxPlayers: number;
  players: Player[];
  matches: Match[];
}

const TournamentDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<TournamentDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setMe(JSON.parse(stored));
    fetchDetail();
    const interval = setInterval(fetchDetail, 5000);
    return () => clearInterval(interval);
  }, [id]);

  const fetchDetail = async () => {
    try {
      const res = await api.get(`/tournaments/${id}`);
      const raw: TournamentDetailData = res.data;

      // ✅ Ensure players and matches are arrays
      const safeData: TournamentDetailData = {
        ...raw,
        players: Array.isArray(raw.players) ? raw.players : [],
        matches: Array.isArray(raw.matches) ? raw.matches : [],
      };

      setData(safeData);
      setError("");

      // Auto-report results: if a match's underlying game has finished but
      // the bracket hasn't been updated yet, report it so the bracket
      // advances automatically without needing a manual "report" click.
      const inProgress = safeData.matches.filter(
        (m) => m.status === "IN_PROGRESS" && m.gameId,
      );
      for (const m of inProgress) {
        try {
          const gameRes = await api.get(`/games/${m.gameId}`);
          const g = gameRes.data.game;
          if (g.status === "WHITE_WINS" || g.status === "BLACK_WINS") {
            const winnerId = g.winnerId;
            if (
              winnerId &&
              (winnerId === m.player1Id || winnerId === m.player2Id)
            ) {
              await api.post(`/tournaments/match/${m.id}/result`, { winnerId });
            }
          }
        } catch {
          // ignore individual match sync failures
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load tournament");
    } finally {
      setLoading(false);
    }
  };

  const usernameFor = (userId: string | null) => {
    if (!userId) return "TBD";
    // ✅ Safe access: use optional chaining and fallback
    return (
      data?.players?.find((p) => p.userId === userId)?.username || "Unknown"
    );
  };

  const joinTournament = async () => {
    try {
      await api.post(`/tournaments/${id}/join`);
      fetchDetail();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to join");
    }
  };

  const startTournament = async () => {
    try {
      await api.put(`/tournaments/${id}/start`);
      fetchDetail();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to start");
    }
  };

  if (loading)
    return (
      <div className="p-8 text-center text-gray-400">Loading tournament...</div>
    );
  if (error || !data)
    return <div className="p-8 text-center text-red-400">{error}</div>;

  // ✅ Safe access to data properties
  const players = data.players || [];
  const matches = data.matches || [];
  const rounds = Array.from(new Set(matches.map((m) => m.round))).sort(
    (a, b) => a - b,
  );
  const isCreator = me?.id === data.createdBy;
  const isPlayer = players.some((p) => p.userId === me?.id);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 p-8">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => navigate("/tournaments")}
          className="text-gray-400 hover:text-white transition mb-6 flex items-center gap-2"
        >
          ← All Tournaments
        </button>

        <div className="glass p-6 mb-6">
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white">🏅 {data.name}</h1>
              <p className="text-gray-400 mt-1">
                {data.description || "No description"}
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium border ${
                data.status === "ACTIVE"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                  : data.status === "FINISHED"
                    ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                    : "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
              }`}
            >
              {data.status}
            </span>
          </div>

          <div className="mt-4 flex gap-2 flex-wrap">
            {data.status === "WAITING" && !isPlayer && (
              <button
                onClick={joinTournament}
                className="btn-premium text-sm py-2 px-4"
              >
                Join Tournament
              </button>
            )}
            {data.status === "WAITING" && isCreator && (
              <button
                onClick={startTournament}
                disabled={players.length < 2}
                className="btn-premium text-sm py-2 px-4 bg-green-600 hover:bg-green-700 disabled:opacity-40"
              >
                Start Tournament ({players.length}/{data.maxPlayers})
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass p-6">
            <h2 className="text-lg font-semibold text-white mb-3">
              Players ({players.length}/{data.maxPlayers})
            </h2>
            <ul className="space-y-2">
              {players.map((p) => (
                <li
                  key={p.userId}
                  className="flex justify-between items-center text-sm bg-white/5 rounded-lg px-3 py-2"
                >
                  <span className="text-white">{p.username}</span>
                  <span
                    className={`text-xs ${
                      p.status === "WINNER"
                        ? "text-yellow-300"
                        : p.status === "ELIMINATED"
                          ? "text-red-400"
                          : "text-emerald-300"
                    }`}
                  >
                    {p.status === "WINNER" ? "🏆 Champion" : p.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-2 glass p-6">
            <h2 className="text-lg font-semibold text-white mb-3">Bracket</h2>
            {rounds.length === 0 ? (
              <p className="text-gray-400 text-sm">
                Matches will appear here once the tournament starts.
              </p>
            ) : (
              <div className="space-y-6">
                {rounds.map((round) => (
                  <div key={round}>
                    <h3 className="text-sm font-semibold text-gray-400 mb-2">
                      Round {round}
                    </h3>
                    <div className="space-y-2">
                      {matches
                        .filter((m) => m.round === round)
                        .map((m) => {
                          const p1 = usernameFor(m.player1Id);
                          const p2 = usernameFor(m.player2Id);
                          const isMyMatch =
                            me &&
                            (m.player1Id === me.id || m.player2Id === me.id);
                          return (
                            <div
                              key={m.id}
                              className="flex justify-between items-center bg-white/5 rounded-lg px-4 py-3"
                            >
                              <div className="text-sm text-white">
                                <span
                                  className={
                                    m.winnerId === m.player1Id
                                      ? "text-yellow-300 font-semibold"
                                      : ""
                                  }
                                >
                                  {p1}
                                </span>
                                <span className="text-gray-500 mx-2">vs</span>
                                <span
                                  className={
                                    m.winnerId === m.player2Id
                                      ? "text-yellow-300 font-semibold"
                                      : ""
                                  }
                                >
                                  {p2}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">
                                  {m.status}
                                </span>
                                {m.gameId && m.status !== "COMPLETED" && (
                                  <button
                                    onClick={() =>
                                      navigate(`/game/${m.gameId}`)
                                    }
                                    className="btn-premium text-xs py-1 px-3"
                                    disabled={!isMyMatch}
                                    title={
                                      isMyMatch
                                        ? "Play this match"
                                        : "Only players in this match can play it"
                                    }
                                  >
                                    {isMyMatch ? "Play" : "Spectate soon"}
                                  </button>
                                )}
                                {m.status === "COMPLETED" && m.gameId && (
                                  <button
                                    onClick={() =>
                                      navigate(`/replay/${m.gameId}`)
                                    }
                                    className="btn-premium-outline text-xs py-1 px-3"
                                  >
                                    Replay
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TournamentDetail;
