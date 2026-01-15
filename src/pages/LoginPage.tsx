import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../assets/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

export default function LoginPage() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ensureUserDoc(uid: string, email: string) {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        email,
        role: "judge", // default: judges can self-register
        createdAt: serverTimestamp(),
      });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "register") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await ensureUserDoc(cred.user.uid, cred.user.email ?? email);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        await ensureUserDoc(cred.user.uid, cred.user.email ?? email);
      }

      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>
        {mode === "login" ? "Login" : "Register"}
      </h1>

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
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={6}
          />
        </label>

        {error && <div style={{ color: "crimson" }}>{error}</div>}

        <button disabled={loading} type="submit">
          {loading ? "Working..." : mode === "login" ? "Login" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setMode(mode === "login" ? "register" : "login")}
        disabled={loading}
      >
        {mode === "login" ? "Need an account? Register" : "Have an account? Login"}
      </button>
    </div>
  );
}
