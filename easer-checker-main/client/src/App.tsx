import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Auth/Login";
import Register from "./components/Auth/Register";
import Home from "./pages/Home";
import GamePage from "./pages/GamePage";
import Profile from "./pages/Profile";
import History from "./pages/History";
import Leaderboard from "./pages/Leaderboard";
import Friends from "./pages/Friends";
import Replay from "./pages/Replay";
import Tournaments from "./pages/Tournaments";
import TournamentDetail from "./pages/TournamentDetail";

function PrivateRoute({ children }: { children: JSX.Element }) {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Home />
            </PrivateRoute>
          }
        />
        <Route
          path="/game/:id"
          element={
            <PrivateRoute>
              <GamePage />
            </PrivateRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <PrivateRoute>
              <Profile />
            </PrivateRoute>
          }
        />
        <Route
          path="/history"
          element={
            <PrivateRoute>
              <History />
            </PrivateRoute>
          }
        />
        <Route
          path="/leaderboard"
          element={
            <PrivateRoute>
              <Leaderboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/friends"
          element={
            <PrivateRoute>
              <Friends />
            </PrivateRoute>
          }
        />
        <Route
          path="/replay"
          element={
            <PrivateRoute>
              <Replay />
            </PrivateRoute>
          }
        />
        <Route
          path="/replay/:id"
          element={
            <PrivateRoute>
              <Replay />
            </PrivateRoute>
          }
        />
        <Route
          path="/tournaments"
          element={
            <PrivateRoute>
              <Tournaments />
            </PrivateRoute>
          }
        />
        <Route
          path="/tournament/:id"
          element={
            <PrivateRoute>
              <TournamentDetail />
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
