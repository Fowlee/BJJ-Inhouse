import { useEffect, useState } from "react";
import { collection, addDoc, onSnapshot, query, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../assets/firebase";
import type { MatchWithId, MatchStatus } from "../types";

export default function AdminPanel() {
  const [matches, setMatches] = useState<MatchWithId[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state for creating new match
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    FighterAName: "",
    FighterBName: "",
    MatId: "mat1",
    Round: 1,
    PositionInRound: 1,
  });

  useEffect(() => {
    const q = query(collection(db, "matches"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as MatchWithId));

      // Sort in memory to avoid needing Firestore composite index
      data.sort((a, b) => {
        const roundDiff = a.Round - b.Round;
        if (roundDiff !== 0) return roundDiff;
        return a.PositionInRound - b.PositionInRound;
      });

      setMatches(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  async function createMatch(e: React.FormEvent) {
    e.preventDefault();

    await addDoc(collection(db, "matches"), {
      ...formData,
      Status: "scheduled" as MatchStatus,
      PointsA: 0,
      PointsB: 0,
      AdvantagesA: 0,
      AdvantagesB: 0,
      PenaltiesA: 0,
      PenaltiesB: 0,
    });

    // Reset form
    setFormData({
      FighterAName: "",
      FighterBName: "",
      MatId: "mat1",
      Round: 1,
      PositionInRound: 1,
    });
    setShowForm(false);
  }

  async function updateMatchStatus(matchId: string, status: MatchStatus) {
    const ref = doc(db, "matches", matchId);
    await updateDoc(ref, { Status: status });
  }

  async function deleteMatch(matchId: string) {
    if (!confirm("Are you sure you want to delete this match?")) return;
    const ref = doc(db, "matches", matchId);
    await deleteDoc(ref);
  }

  async function updateMatchMat(matchId: string, matId: string) {
    const ref = doc(db, "matches", matchId);
    await updateDoc(ref, { MatId: matId });
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ maxWidth: 1200, margin: "40px auto", display: "grid", gap: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Admin Panel</h1>
        <button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Create New Match"}
        </button>
      </header>

      {showForm && (
        <form
          onSubmit={createMatch}
          style={{
            display: "grid",
            gap: 12,
            padding: 20,
            border: "1px solid #ccc",
            borderRadius: 8
          }}
        >
          <h2 style={{ margin: 0 }}>New Match</h2>

          <label style={{ display: "grid", gap: 4 }}>
            Fighter A Name
            <input
              type="text"
              value={formData.FighterAName}
              onChange={(e) => setFormData({ ...formData, FighterAName: e.target.value })}
              required
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            Fighter B Name
            <input
              type="text"
              value={formData.FighterBName}
              onChange={(e) => setFormData({ ...formData, FighterBName: e.target.value })}
              required
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            Mat
            <select
              value={formData.MatId}
              onChange={(e) => setFormData({ ...formData, MatId: e.target.value })}
            >
              <option value="mat1">Mat 1</option>
              <option value="mat2">Mat 2</option>
              <option value="mat3">Mat 3</option>
              <option value="mat4">Mat 4</option>
            </select>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 4 }}>
              Round
              <input
                type="number"
                min="1"
                value={formData.Round}
                onChange={(e) => setFormData({ ...formData, Round: parseInt(e.target.value) })}
                required
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              Position in Round
              <input
                type="number"
                min="1"
                value={formData.PositionInRound}
                onChange={(e) => setFormData({ ...formData, PositionInRound: parseInt(e.target.value) })}
                required
              />
            </label>
          </div>

          <button type="submit">Create Match</button>
        </form>
      )}

      <section>
        <h2>All Matches ({matches.length})</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {matches.map((match) => (
            <div
              key={match.id}
              style={{
                display: "grid",
                gridTemplateColumns: "3fr 1fr 1fr 1fr 1fr",
                gap: 8,
                padding: 12,
                border: "1px solid #ddd",
                borderRadius: 4,
                alignItems: "center",
                background: match.Status === "finished" ? "#f0f0f0" : "white",
              }}
            >
              <div>
                <strong>
                  {match.FighterAName} vs {match.FighterBName}
                </strong>
                <div style={{ fontSize: "0.9em", color: "#666" }}>
                  Round {match.Round}, Position {match.PositionInRound}
                </div>
                {match.Status === "finished" && match.WinnerId && (
                  <div style={{ fontSize: "0.85em", color: "#28a745", fontWeight: "bold" }}>
                    Winner: {match.WinnerId === "fighterA" ? match.FighterAName : match.FighterBName} ({match.WinMethod})
                  </div>
                )}
              </div>

              <select
                value={match.MatId}
                onChange={(e) => updateMatchMat(match.id, e.target.value)}
                disabled={match.Status === "finished"}
              >
                <option value="mat1">Mat 1</option>
                <option value="mat2">Mat 2</option>
                <option value="mat3">Mat 3</option>
                <option value="mat4">Mat 4</option>
              </select>

              <select
                value={match.Status}
                onChange={(e) => updateMatchStatus(match.id, e.target.value as MatchStatus)}
              >
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="finished">Finished</option>
              </select>

              <div style={{ fontSize: "0.85em" }}>
                A: {match.PointsA}p / {match.AdvantagesA}a<br />
                B: {match.PointsB}p / {match.AdvantagesB}a
              </div>

              <button
                onClick={() => deleteMatch(match.id)}
                style={{ background: "#dc3545", color: "white" }}
              >
                Delete
              </button>
            </div>
          ))}

          {matches.length === 0 && <div>No matches yet. Create one to get started!</div>}
        </div>
      </section>
    </div>
  );
}
