import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

interface Tournament {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  status: "WAITING" | "ACTIVE" | "COMPLETED";
  maxPlayers: number;
  startedAt: string | null;
  endedAt: string | null;
}

const Tournaments = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newTournament, setNewTournament] = useState({
    name: "",
    description: "",
    maxPlayers: 8,
  });
  const navigate = useNavigate();

  useEffect(() => {
    fetchTournaments();
  }, []);

  const fetchTournaments = async () => {
    try {
      setLoading(true);
      const res = await api.get("/tournaments");
      setTournaments(res.data);
      setError("");
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load tournaments");
    } finally {
      setLoading(false);
    }
  };

  const createTournament = async () => {
    if (!newTournament.name.trim()) {
      alert("Please enter a tournament name");
      return;
    }
    try {
      await api.post("/tournaments", newTournament);
      await fetchTournaments();
      setNewTournament({ name: "", description: "", maxPlayers: 8 });
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to create tournament");
    }
  };

  const joinTournament = async (id: string) => {
    try {
      await api.post(`/tournaments/${id}/join`);
      await fetchTournaments();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to join");
    }
  };

  const startTournament = async (id: string) => {
    try {
      await api.put(`/tournaments/${id}/start`);
      await fetchTournaments();
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to start");
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading tournaments...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white transition mb-6 flex items-center gap-2"
        >
          ← Back to Dashboard
        </button>
        <h1 className="text-3xl font-bold text-white mb-6">🏅 Tournaments</h1>

        {error && (
          <div className="glass p-4 mb-4 text-red-400 border border-red-500/30 rounded-xl">
            {error}
          </div>
        )}

        <div className="glass p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-3">Create Tournament</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Name"
              value={newTournament.name}
              onChange={(e) =>
                setNewTournament({ ...newTournament, name: e.target.value })
              }
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <input
              type="text"
              placeholder="Description"
              value={newTournament.description}
              onChange={(e) =>
                setNewTournament({
                  ...newTournament,
                  description: e.target.value,
                })
              }
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <input
              type="number"
              placeholder="Max Players"
              value={newTournament.maxPlayers}
              onChange={(e) =>
                setNewTournament({
                  ...newTournament,
                  maxPlayers: parseInt(e.target.value) || 8,
                })
              }
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>
          <button onClick={createTournament} className="mt-3 btn-premium">
            Create
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tournaments.length === 0 ? (
            <div className="col-span-2 text-center text-gray-400 py-12">
              No tournaments yet. Create one to get started!
            </div>
          ) : (
            tournaments.map((t) => (
              <div key={t.id} className="glass p-6">
                <h3 className="text-xl font-bold text-white">{t.name}</h3>
                <p className="text-gray-400 text-sm">{t.description || "No description"}</p>
                <p className="text-sm text-gray-300 mt-1">
                  Status: <span className="font-medium">{t.status}</span> • 
                  Max Players: {t.maxPlayers}
                </p>
                <div className="mt-3 flex gap-2 flex-wrap">
                  <button
                    onClick={() => joinTournament(t.id)}
                    className="btn-premium text-sm py-1 px-3"
                    disabled={t.status !== "WAITING"}
                  >
                    Join
                  </button>
                  {t.status === "WAITING" && (
                    <button
                      onClick={() => startTournament(t.id)}
                      className="btn-premium text-sm py-1 px-3 bg-green-600 hover:bg-green-700"
                    >
                      Start
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/tournament/${t.id}`)}
                    className="btn-premium-outline text-sm py-1 px-3"
                  >
                    View
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Tournaments;
