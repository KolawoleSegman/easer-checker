import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

interface Player {
  username: string;
  eloRating: number;
}

const Leaderboard = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
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
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-2 px-4 text-gray-400 text-sm">Rank</th>
                <th className="py-2 px-4 text-gray-400 text-sm">Player</th>
                <th className="py-2 px-4 text-gray-400 text-sm text-right">
                  ELO
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="py-2 px-4 text-white">{i + 1}</td>
                  <td className="py-2 px-4 text-white">{p.username}</td>
                  <td className="py-2 px-4 text-yellow-300 text-right">
                    {p.eloRating}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;
