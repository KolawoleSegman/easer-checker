import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { API_BASE_URL } from "../api/client";

interface Player {
  id: string;
  username: string;
  avatar: string | null;
  eloRating: number;
  wins: number | null;
  losses: number | null;
}

const medalFor = (rank: number) => {
  if (rank === 0) return "🥇";
  if (rank === 1) return "🥈";
  if (rank === 2) return "🥉";
  return null;
};

const Leaderboard = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setMe(JSON.parse(stored));
    api
      .get("/users/leaderboard")
      .then((res) => setPlayers(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return <div className="p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 p-8">
      <div className="max-w-4xl mx-auto glass p-8">
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white transition mb-6 flex items-center gap-2"
        >
          ← Back to Dashboard
        </button>
        <h1 className="text-3xl font-bold text-white mb-6">🏆 Leaderboard</h1>
        {players.length === 0 ? (
          <p className="text-gray-400 text-center py-8">
            No ranked players yet — win a multiplayer game to appear here!
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-2 px-4 text-gray-400 text-sm">Rank</th>
                  <th className="py-2 px-4 text-gray-400 text-sm">Player</th>
                  <th className="py-2 px-4 text-gray-400 text-sm text-center">W / L</th>
                  <th className="py-2 px-4 text-gray-400 text-sm text-right">ELO</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => {
                  const isMe = me && p.id === me.id;
                  const avatarUrl = p.avatar
                    ? `${API_BASE_URL}${p.avatar}`
                    : `https://ui-avatars.com/api/?name=${encodeURIComponent(p.username)}&background=random&size=32&rounded=true`;
                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-white/5 ${isMe ? "bg-primary-500/10" : ""}`}
                    >
                      <td className="py-2 px-4 text-white font-medium">
                        {medalFor(i) || `#${i + 1}`}
                      </td>
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-2">
                          <img
                            src={avatarUrl}
                            alt={p.username}
                            className="w-7 h-7 rounded-full border border-white/20 object-cover"
                          />
                          <span className="text-white">
                            {p.username}
                            {isMe && <span className="text-yellow-300 text-xs ml-1">(you)</span>}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-4 text-center text-sm text-gray-300">
                        {p.wins ?? 0} / {p.losses ?? 0}
                      </td>
                      <td className="py-2 px-4 text-yellow-300 text-right font-semibold">
                        {p.eloRating}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;
