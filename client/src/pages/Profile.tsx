import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

const Profile = () => {
  const [user, setUser] = useState<any>(null);
  const [avatar, setAvatar] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    fetchProfile();
  }, []);

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
      setMessage("Profile picture updated!");
      // Update local storage user avatar
      const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
      storedUser.avatar = res.data.avatar;
      localStorage.setItem("user", JSON.stringify(storedUser));
    } catch (err: any) {
      setMessage(err.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (!user) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 p-8">
      <div className="max-w-lg mx-auto glass p-8">
        <h2 className="text-2xl font-bold text-white mb-4">Profile</h2>
        <div className="flex items-center gap-4 mb-6">
          <img
            src={
              avatar
                ? `http://localhost:3001${avatar}`
                : `https://ui-avatars.com/api/?name=${user.username}&background=random&size=80`
            }
            alt={user.username}
            className="w-20 h-20 rounded-full border-2 border-white/20"
          />
          <div>
            <div className="text-white font-semibold">{user.username}</div>
            <div className="text-gray-400 text-sm">{user.email}</div>
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
            className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-gray-400"
          />
        </div>
        <button
          onClick={handleUpload}
          disabled={uploading || !file}
          className="btn-premium w-full flex items-center justify-center gap-2"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
        {message && (
          <div
            className={`mt-4 text-sm ${message.includes("failed") ? "text-red-400" : "text-green-400"}`}
          >
            {message}
          </div>
        )}
        <button
          onClick={() => navigate("/")}
          className="mt-4 text-gray-400 hover:text-white transition"
        >
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default Profile;
