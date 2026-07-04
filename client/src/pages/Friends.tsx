import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

interface Friend {
  userId: string;
  username: string;
}

interface Request {
  id: string;
  userId: string;
  username: string;
}

const Friends = () => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [addUsername, setAddUsername] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [friendsRes, requestsRes] = await Promise.all([
        api.get("/friends"),
        api.get("/friends/requests"),
      ]);
      setFriends(friendsRes.data);
      setRequests(requestsRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const addFriend = async () => {
    if (!addUsername.trim()) return;
    try {
      // Find user by username (we need an endpoint for that)
      // For simplicity, we'll ask for userId; but we can add a search endpoint.
      alert(
        "Please enter the user ID (you can find it in the URL of their profile).",
      );
    } catch (err) {
      setMessage("Failed to send request");
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

        <div className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={addUsername}
              onChange={(e) => setAddUsername(e.target.value)}
              placeholder="Enter username to add"
              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <button onClick={addFriend} className="btn-premium">
              Add Friend
            </button>
          </div>
          {message && <p className="mt-2 text-sm text-red-400">{message}</p>}
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
          <p className="text-gray-400 text-sm">No friends yet</p>
        ) : (
          <ul className="space-y-2">
            {friends.map((f) => (
              <li
                key={f.userId}
                className="flex justify-between items-center glass p-3"
              >
                <span className="text-white">{f.username}</span>
                <button
                  onClick={() => removeFriend(f.userId)}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Friends;
