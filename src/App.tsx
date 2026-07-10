import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import MatScoringPage from "./pages/MatScoringPage";
import BracketView from "./pages/BracketView";
import SpectatorView from "./pages/SpectatorView";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div>Loading...</div>;

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes - accessible without login */}
        <Route path="/spectator" element={<SpectatorView />} />

        {!user ? (
          <>
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<Navigate to="/login" />} />
          </>
        ) : (
          <>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/mat/:matId" element={<MatScoringPage />} />
            <Route path="/bracket/:bracketId" element={<BracketView />} />
            <Route path="*" element={<Navigate to="/dashboard" />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}
