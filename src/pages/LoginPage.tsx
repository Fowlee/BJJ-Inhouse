import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../assets/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

export default function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ensureUserDoc(uid: string, email: string) {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Firestore timeout")), 5000);
    });

    try {
      const ref = doc(db, "users", uid);
      const snap = await Promise.race([getDoc(ref), timeout]);

      if (!snap.exists()) {
        await Promise.race([
          setDoc(ref, {
            email,
            role: "judge", // default: judges can self-register
            createdAt: serverTimestamp(),
          }),
          timeout,
        ]);
      }
    } catch (err) {
      console.error("Error ensuring user doc:", err);
      // Continue anyway - AuthContext will handle role
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await ensureUserDoc(cred.user.uid, cred.user.email ?? email);
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Admin Login</h1>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            autoComplete="email"
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            autoComplete="current-password"
            minLength={6}
          />
        </label>

        {error && <div style={{ color: "crimson" }}>{error}</div>}

        <button disabled={loading} type="submit">
          {loading ? "Working..." : "Login"}
        </button>
      </form>

      <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid #333", textAlign: "center" }}>
        <p style={{ margin: "0 0 12px 0", color: "#888", fontSize: "0.875rem" }}>
          Here to watch? No login needed.
        </p>
        <button
          type="button"
          onClick={() => navigate("/spectator")}
          style={{ background: "#333", width: "100%" }}
        >
          View Live Brackets
        </button>
      </div>
    </div>
  );
}
