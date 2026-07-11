import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { API_BASE_URL } from "../api/client";

interface Friend {
  userId: string;
  username: string;
}

interface Request {
  id: string;
  userId: string;
  username: string;
}

interface SearchResult {
  id: string;
  username: string;
  avatar: string | null;
  eloRating: number;
}

const Friends = () => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [challenging, setChallenging] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (query.trim().length > 0) {
        runSearch();
      } else {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const fetchData = async () => {
    try {
      const [friendsRes, requestsRes] = await Promise.all([
        api.get("/friends"),
        api.get("/friends/requests"),
      ]);
      // ✅ Ensure we always set arrays
      setFriends(Array.isArray(friendsRes.data) ? friendsRes.data : []);
      setRequests(Array.isArray(requestsRes.data) ? requestsRes.data : []);
    } catch (err) {
      console.error(err);
    }
  };

  const runSearch = async () => {
    try {
      setSearching(true);
      const res = await api.get(
        `/users/search?q=${encodeURIComponent(query.trim())}`,
      );
      // ✅ Safely extract the array
      const data = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
      setResults(data);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async (userId: string) => {
    try {
      setMessage("");
      await api.post(`/friends/request/${userId}`);
      setMessage("Friend request sent!");
      // ✅ Only filter if results is an array
      setResults((prev) =>
        Array.isArray(prev) ? prev.filter((u) => u.id !== userId) : [],
      );
    } catch (err: any) {
      setMessage(err.response?.data?.message || "Failed to send request");
    }
  };

  const acceptRequest = async (userId: string) => {
    await api.put(`/friends/accept/${userId}`);
    fetchData();
  };

  const removeFriend = async (userId: string) => {
    await api.delete(`/friends/${userId}`);
    fetchData();
  };

  const challengeFriend = async (userId: string) => {
    try {
      setChallenging(userId);
      const res = await api.post("/games", { opponentId: userId });
      navigate(`/game/${res.data.id}`);
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to create challenge");
    } finally {
      setChallenging(null);
    }
  };

  const avatarFor = (username: string, avatar?: string | null) =>
    avatar
      ? `${API_BASE_URL}${avatar}`
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random&size=40&rounded=true`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 p-8">
      <div className="max-w-4xl mx-auto glass p-8">
        <button
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white transition mb-6 flex items-center gap-2"
        >
          ← Back to Dashboard
        </button>
        <h1 className="text-3xl font-bold text-white mb-6">👥 Friends</h1>

        <div className="mb-8">
          <label className="block text-gray-300 text-sm font-medium mb-2">
            Find players by username
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search username..."
            className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
          {message && (
            <p className="mt-2 text-sm text-primary-300">{message}</p>
          )}

          {query.trim().length > 0 && (
            <div className="mt-3 space-y-2">
              {searching ? (
                <p className="text-gray-400 text-sm">Searching...</p>
              ) : results.length === 0 ? (
                <p className="text-gray-400 text-sm">No players found</p>
              ) : (
                results.map((u) => (
                  <div
                    key={u.id}
                    className="flex justify-between items-center glass p-3"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={avatarFor(u.username, u.avatar)}
                        alt={u.username}
                        className="w-9 h-9 rounded-full border border-white/20 object-cover"
                      />
                      <div>
                        <div className="text-white text-sm font-medium">
                          {u.username}
                        </div>
                        <div className="text-gray-400 text-xs">
                          ELO {u.eloRating}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => sendRequest(u.id)}
                      className="btn-premium text-sm py-1 px-3"
                    >
                      Add Friend
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <h2 className="text-xl font-semibold text-white mb-3">
          Friend Requests ({requests.length})
        </h2>
        {requests.length === 0 ? (
          <p className="text-gray-400 text-sm mb-4">No pending requests</p>
        ) : (
          <ul className="space-y-2 mb-6">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex justify-between items-center glass p-3"
              >
                <span className="text-white">{r.username}</span>
                <button
                  onClick={() => acceptRequest(r.userId)}
                  className="btn-premium text-sm py-1 px-3"
                >
                  Accept
                </button>
              </li>
            ))}
          </ul>
        )}

        <h2 className="text-xl font-semibold text-white mb-3">
          Your Friends ({friends.length})
        </h2>
        {friends.length === 0 ? (
          <p className="text-gray-400 text-sm">
            No friends yet — search above to add some!
          </p>
        ) : (
          <ul className="space-y-2">
            {friends.map((f) => (
              <li
                key={f.userId}
                className="flex justify-between items-center glass p-3"
              >
                <span className="text-white">{f.username}</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => challengeFriend(f.userId)}
                    disabled={challenging === f.userId}
                    className="btn-premium text-sm py-1 px-3"
                  >
                    {challenging === f.userId ? "Creating..." : "⚔️ Challenge"}
                  </button>
                  <button
                    onClick={() => removeFriend(f.userId)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Friends;
