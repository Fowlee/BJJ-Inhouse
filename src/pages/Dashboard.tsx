import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../assets/firebase";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const mats = [
    { id: "mat1", name: "Mat 1" },
    { id: "mat2", name: "Mat 2" },
    { id: "mat3", name: "Mat 3" },
    { id: "mat4", name: "Mat 4" },
  ];

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", display: "grid", gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>Dashboard</h1>
          <div>Role: <strong>{user.role}</strong></div>
        </div>

        <button onClick={() => signOut(auth)}>Logout</button>
      </header>

      {user.role === "admin" ? (
        <div>Admin panel (next)</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0 }}>Choose your mat</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {mats.map((m) => (
              <button key={m.id} onClick={() => navigate(`/mat/${m.id}`)}>
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
