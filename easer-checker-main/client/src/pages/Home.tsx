import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { API_BASE_URL } from "../api/client";
import { getSoundEnabled, setSoundEnabled } from "../soundSettings";

interface Stats {
  wins: number;
  losses: number;
  draws: number;
  maxWinStreak: number;
}

interface RecentGame {
  id: string;
  status: "ACTIVE" | "WHITE_WINS" | "BLACK_WINS" | "DRAW" | "ABANDONED";
  myColor: "white" | "black";
  opponentUsername: string;
  opponentAvatar: string;
  isAI: boolean;
  difficulty: string | null;
  result: "WIN" | "LOSS" | "DRAW" | "ONGOING";
  startedAt: string;
  endedAt: string | null;
}

const resultBadge = (result: RecentGame["result"]) => {
  switch (result) {
    case "WIN":
      return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    case "LOSS":
      return "bg-red-500/20 text-red-300 border-red-500/30";
    case "DRAW":
      return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    default:
      return "bg-blue-500/20 text-blue-300 border-blue-500/30 animate-pulse";
  }
};

const Home = () => {
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<Stats>({
    wins: 0,
    losses: 0,
    draws: 0,
    maxWinStreak: 0,
  });
  const [difficulty, setDifficulty] = useState("medium");
  const [joinLink, setJoinLink] = useState("");
  const [soundEnabled, setSoundEnabledState] = useState(getSoundEnabled());
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
    fetchStats();
    fetchRecentGames();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await api.get("/users/me/stats");
      setStats(res.data);
    } catch {
      // ignore
    }
  };

  const fetchRecentGames = async () => {
    try {
      setLoadingGames(true);
      const res = await api.get("/users/me/games");
      setRecentGames(res.data);
    } catch {
      // ignore
    } finally {
      setLoadingGames(false);
    }
  };

  const toggleSound = () => {
    const newState = !soundEnabled;
    setSoundEnabledState(newState);
    setSoundEnabled(newState);
  };

  const createAIGame = async () => {
    try {
      const res = await api.post("/games", { isAI: true, difficulty });
      navigate(`/game/${res.data.id}`);
    } catch (err) {
      alert("Failed to create game");
    }
  };

  const createMultiplayerGame = async () => {
    try {
      const res = await api.post("/games", { isMultiplayer: true });
      navigate(`/game/${res.data.id}`);
    } catch (err) {
      alert("Failed to create game");
    }
  };

  const joinGame = () => {
    if (!joinLink.trim()) {
      alert("Please paste a game link or ID");
      return;
    }
    let gameId = joinLink.trim();
    const match = gameId.match(/\/game\/([a-f0-9-]+)/);
    if (match) gameId = match[1];
    if (/^[a-f0-9-]{36}$/.test(gameId)) {
      navigate(`/game/${gameId}`);
    } else {
      alert("Invalid game link or ID");
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Avatar URL
  const avatarUrl = user.avatar
    ? `${API_BASE_URL}${user.avatar}`
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=random&size=40&rounded=true`;

  const ongoingGames = recentGames.filter((g) => g.result === "ONGOING");

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 relative overflow-hidden">
      {/* Background blurs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-500/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-6xl mx-auto p-6">
        {/* Top Navigation Bar */}
        <div className="glass p-4 flex items-center justify-between flex-wrap gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold bg-gradient-to-r from-yellow-400 to-amber-400 bg-clip-text text-transparent">
              Easer Checker
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {/* Sound Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-gray-300 text-sm">🔊</span>
              <button
                onClick={toggleSound}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${
                  soundEnabled ? "bg-primary-500" : "bg-gray-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                    soundEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-gray-300 text-sm">
                {soundEnabled ? "On" : "Off"}
              </span>
            </div>

            {/* Profile */}
            <button
              onClick={() => navigate("/profile")}
              className="flex items-center gap-2 hover:bg-white/10 px-3 py-1.5 rounded-lg transition"
            >
              <img
                src={avatarUrl}
                alt={user.username}
                className="w-8 h-8 rounded-full border-2 border-white/20 object-cover"
              />
              <span className="text-white font-medium">{user.username}</span>
            </button>

            {/* Logout */}
            <button
              onClick={logout}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg border border-red-500/20 transition text-sm"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Continue playing banner */}
        {ongoingGames.length > 0 && (
          <div className="glass p-4 mb-8 border border-primary-500/30 bg-primary-500/5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 text-primary-300 font-medium">
                <span className="animate-pulse">●</span>
                You have {ongoingGames.length} game
                {ongoingGames.length > 1 ? "s" : ""} in progress
              </div>
              <div className="flex gap-2 flex-wrap">
                {ongoingGames.slice(0, 3).map((g) => (
                  <button
                    key={g.id}
                    onClick={() => navigate(`/game/${g.id}`)}
                    className="btn-premium text-sm py-1.5 px-4"
                  >
                    Continue vs {g.opponentUsername}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="glass p-6 text-center hover:scale-[1.02] transition-all duration-300">
            <div className="text-3xl mb-2">🏆</div>
            <div className="text-3xl font-bold text-white">{stats.wins}</div>
            <div className="text-gray-400 text-sm">Wins</div>
          </div>
          <div className="glass p-6 text-center hover:scale-[1.02] transition-all duration-300">
            <div className="text-3xl mb-2">💔</div>
            <div className="text-3xl font-bold text-white">{stats.losses}</div>
            <div className="text-gray-400 text-sm">Losses</div>
          </div>
          <div className="glass p-6 text-center hover:scale-[1.02] transition-all duration-300">
            <div className="text-3xl mb-2">🤝</div>
            <div className="text-3xl font-bold text-white">{stats.draws}</div>
            <div className="text-gray-400 text-sm">Draws</div>
          </div>
          <div className="glass p-6 text-center hover:scale-[1.02] transition-all duration-300">
            <div className="text-3xl mb-2">🔥</div>
            <div className="text-3xl font-bold text-white">
              {stats.maxWinStreak}
            </div>
            <div className="text-gray-400 text-sm">Win Streak</div>
          </div>
        </div>

        {/* Action Cards – 4 columns on large screens */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Play vs AI */}
          <div className="glass p-6 group hover:scale-[1.02] transition-all duration-300">
            <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">
              🤖
            </div>
            <h3 className="text-xl font-semibold text-white">Play vs AI</h3>
            <p className="text-gray-400 text-sm mt-1">Challenge the computer</p>
            <div className="mt-3">
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
                <option value="expert">Expert</option>
              </select>
            </div>
            <button
              onClick={createAIGame}
              className="mt-3 w-full btn-premium text-sm py-2"
            >
              Start Game
            </button>
          </div>

          {/* Multiplayer */}
          <div className="glass p-6 group hover:scale-[1.02] transition-all duration-300">
            <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">
              👥
            </div>
            <h3 className="text-xl font-semibold text-white">Multiplayer</h3>
            <p className="text-gray-400 text-sm mt-1">Play with a friend</p>
            <button
              onClick={createMultiplayerGame}
              className="mt-3 w-full btn-premium text-sm py-2"
            >
              Create Game
            </button>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={joinLink}
                onChange={(e) => setJoinLink(e.target.value)}
                placeholder="Paste link or ID"
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
              <button
                onClick={joinGame}
                className="px-3 py-1.5 bg-primary-500/30 hover:bg-primary-500/50 rounded-lg text-white text-sm transition"
              >
                Join
              </button>
            </div>
          </div>

          {/* History */}
          <div
            className="glass p-6 group hover:scale-[1.02] transition-all duration-300 cursor-pointer"
            onClick={() => navigate("/history")}
          >
            <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">
              📖
            </div>
            <h3 className="text-xl font-semibold text-white">History</h3>
            <p className="text-gray-400 text-sm mt-1">Learn about checkers</p>
          </div>

          {/* Leaderboard */}
          <div
            className="glass p-6 group hover:scale-[1.02] transition-all duration-300 cursor-pointer"
            onClick={() => navigate("/leaderboard")}
          >
            <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">
              🏆
            </div>
            <h3 className="text-xl font-semibold text-white">Leaderboard</h3>
            <p className="text-gray-400 text-sm mt-1">Global rankings</p>
          </div>

          {/* Friends */}
          <div
            className="glass p-6 group hover:scale-[1.02] transition-all duration-300 cursor-pointer"
            onClick={() => navigate("/friends")}
          >
            <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">
              👥
            </div>
            <h3 className="text-xl font-semibold text-white">Friends</h3>
            <p className="text-gray-400 text-sm mt-1">Add & challenge</p>
          </div>

          {/* Replay */}
          <div
            className="glass p-6 group hover:scale-[1.02] transition-all duration-300 cursor-pointer"
            onClick={() => navigate("/replay")}
          >
            <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">
              🎬
            </div>
            <h3 className="text-xl font-semibold text-white">Replay</h3>
            <p className="text-gray-400 text-sm mt-1">Watch past games</p>
          </div>

          {/* Tournaments */}
          <div
            className="glass p-6 group hover:scale-[1.02] transition-all duration-300 cursor-pointer"
            onClick={() => navigate("/tournaments")}
          >
            <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">
              🏅
            </div>
            <h3 className="text-xl font-semibold text-white">Tournaments</h3>
            <p className="text-gray-400 text-sm mt-1">Compete in brackets</p>
          </div>

          {/* Profile (already in top bar, but we keep a card for consistency) */}
          <div
            className="glass p-6 group hover:scale-[1.02] transition-all duration-300 cursor-pointer"
            onClick={() => navigate("/profile")}
          >
            <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">
              👤
            </div>
            <h3 className="text-xl font-semibold text-white">Profile</h3>
            <p className="text-gray-400 text-sm mt-1">Manage your account</p>
          </div>
        </div>

        {/* Recent Games */}
        <div className="glass p-6 mt-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-white">Recent Games</h3>
            <span className="text-sm text-gray-400">
              Last {recentGames.length || 0} games
            </span>
          </div>
          <div className="space-y-2">
            {loadingGames ? (
              <div className="text-sm text-gray-400 p-3">Loading…</div>
            ) : recentGames.length === 0 ? (
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl">
                <span className="text-sm text-gray-300">No games played yet</span>
              </div>
            ) : (
              recentGames.slice(0, 8).map((g) => {
                const oppAvatarUrl = g.opponentAvatar
                  ? `${API_BASE_URL}${g.opponentAvatar}`
                  : `https://ui-avatars.com/api/?name=${encodeURIComponent(g.isAI ? "AI" : g.opponentUsername)}&background=random&size=32&rounded=true`;
                return (
                  <div
                    key={g.id}
                    className="flex justify-between items-center p-3 bg-white/5 hover:bg-white/10 rounded-xl transition cursor-pointer"
                    onClick={() =>
                      navigate(
                        g.result === "ONGOING" ? `/game/${g.id}` : `/replay/${g.id}`,
                      )
                    }
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={oppAvatarUrl}
                        alt={g.opponentUsername}
                        className="w-8 h-8 rounded-full border border-white/20 object-cover flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-sm text-white font-medium truncate">
                          vs {g.opponentUsername}
                          {g.isAI && g.difficulty && (
                            <span className="text-gray-400 font-normal">
                              {" "}
                              ({g.difficulty})
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {g.myColor === "white" ? "Playing White" : "Playing Black"} ·{" "}
                          {new Date(g.startedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${resultBadge(g.result)}`}
                      >
                        {g.result === "ONGOING" ? "In progress" : g.result}
                      </span>
                      <span className="text-gray-400 text-xs hidden sm:inline">
                        {g.result === "ONGOING" ? "Continue →" : "Replay →"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-10 text-center text-gray-500 text-sm border-t border-white/5 pt-6">
          <p>© 2026 Easer Checker – Nigerian Draughts · Made with ♥</p>
        </div>
      </div>
    </div>
  );
};

export default Home;
