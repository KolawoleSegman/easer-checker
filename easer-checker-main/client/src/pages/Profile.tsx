import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { API_BASE_URL } from "../api/client";

interface Stats {
  wins: number;
  losses: number;
  draws: number;
  maxWinStreak: number;
}

const Profile = () => {
  const [user, setUser] = useState<any>(null);
  const [avatar, setAvatar] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState<Stats>({ wins: 0, losses: 0, draws: 0, maxWinStreak: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    fetchProfile();
    api
      .get("/users/me/stats")
      .then((res) => setStats(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const fetchProfile = async () => {
    try {
      const res = await api.get("/profile");
      setUser(res.data);
      setAvatar(res.data.avatar || "");
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setMessage("");
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage("Please select a file");
      return;
    }
    const formData = new FormData();
    formData.append("avatar", file);
    setUploading(true);
    setMessage("");
    try {
      const res = await api.post("/profile/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAvatar(res.data.avatar);
      setFile(null);
      setMessage("Profile picture updated!");
      // Update local storage user avatar so it's reflected everywhere
      // (nav bar, recent games, leaderboard) without a full reload.
      const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
      storedUser.avatar = res.data.avatar;
      localStorage.setItem("user", JSON.stringify(storedUser));
    } catch (err: any) {
      setMessage(err.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (!user) return <div className="p-8 text-center text-gray-400">Loading profile...</div>;

  const displayAvatar =
    previewUrl ||
    (avatar
      ? `${API_BASE_URL}${avatar}`
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=random&size=80`);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 p-8">
      <div className="max-w-lg mx-auto glass p-8">
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white transition mb-6 flex items-center gap-2"
        >
          ← Back to Dashboard
        </button>
        <h2 className="text-2xl font-bold text-white mb-4">Profile</h2>
        <div className="flex items-center gap-4 mb-6">
          <img
            src={displayAvatar}
            alt={user.username}
            className="w-20 h-20 rounded-full border-2 border-white/20 object-cover"
          />
          <div>
            <div className="text-white font-semibold text-lg">{user.username}</div>
            <div className="text-gray-400 text-sm">{user.email}</div>
            <div className="text-yellow-300 text-sm mt-1">ELO {user.eloRating ?? 1200}</div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-6 text-center">
          <div className="bg-white/5 rounded-xl py-3">
            <div className="text-lg font-bold text-white">{stats.wins}</div>
            <div className="text-xs text-gray-400">Wins</div>
          </div>
          <div className="bg-white/5 rounded-xl py-3">
            <div className="text-lg font-bold text-white">{stats.losses}</div>
            <div className="text-xs text-gray-400">Losses</div>
          </div>
          <div className="bg-white/5 rounded-xl py-3">
            <div className="text-lg font-bold text-white">{stats.draws}</div>
            <div className="text-xs text-gray-400">Draws</div>
          </div>
          <div className="bg-white/5 rounded-xl py-3">
            <div className="text-lg font-bold text-white">{stats.maxWinStreak}</div>
            <div className="text-xs text-gray-400">Streak</div>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-gray-300 text-sm font-medium mb-1">
            Upload new avatar
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary-500/30 file:text-white file:cursor-pointer"
          />
        </div>
        <button
          onClick={handleUpload}
          disabled={uploading || !file}
          className="btn-premium w-full flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {uploading ? "Uploading..." : "Save Avatar"}
        </button>
        {message && (
          <div
            className={`mt-4 text-sm ${message.toLowerCase().includes("failed") ? "text-red-400" : "text-green-400"}`}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
