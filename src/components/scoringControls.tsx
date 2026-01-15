import { doc, increment, updateDoc } from "firebase/firestore";
import { db } from "../assets/firebase";

type Props = { matchId: string };

type IncField =
  | "PointsA" | "PointsB"
  | "AdvantagesA" | "AdvantagesB"
  | "PenaltiesA" | "PenaltiesB";

async function inc(matchId: string, field: IncField, delta: number) {
  const ref = doc(db, "matches", matchId);
  await updateDoc(ref, { [field]: increment(delta) } as any);
}

async function finishMatch(matchId: string, winner: "A" | "B", method: "points" | "submission" | "ref_decision") {
  const ref = doc(db, "matches", matchId);
  const winnerId = winner === "A" ? "fighterA" : "fighterB";

  await updateDoc(ref, {
    Status: "finished",
    WinnerId: winnerId,
    WinMethod: method
  });
}

export function ScoringControls({ matchId }: Props) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <section style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Points</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button onClick={() => inc(matchId, "PointsA", 2)}>A +2 Takedown</button>
          <button onClick={() => inc(matchId, "PointsB", 2)}>B +2 Takedown</button>

          <button onClick={() => inc(matchId, "PointsA", 2)}>A +2 Sweep</button>
          <button onClick={() => inc(matchId, "PointsB", 2)}>B +2 Sweep</button>

          <button onClick={() => inc(matchId, "PointsA", 3)}>A +3 Pass</button>
          <button onClick={() => inc(matchId, "PointsB", 3)}>B +3 Pass</button>

          <button onClick={() => inc(matchId, "PointsA", 4)}>A +4 Mount</button>
          <button onClick={() => inc(matchId, "PointsB", 4)}>B +4 Mount</button>

          <button onClick={() => inc(matchId, "PointsA", 4)}>A +4 Back</button>
          <button onClick={() => inc(matchId, "PointsB", 4)}>B +4 Back</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button onClick={() => inc(matchId, "PointsA", -1)}>A Undo -1</button>
          <button onClick={() => inc(matchId, "PointsB", -1)}>B Undo -1</button>
        </div>
      </section>

      <section style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Advantages</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button onClick={() => inc(matchId, "AdvantagesA", 1)}>A +1 Adv</button>
          <button onClick={() => inc(matchId, "AdvantagesB", 1)}>B +1 Adv</button>
          <button onClick={() => inc(matchId, "AdvantagesA", -1)}>A Undo</button>
          <button onClick={() => inc(matchId, "AdvantagesB", -1)}>B Undo</button>
        </div>
      </section>

      <section style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Penalties</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button onClick={() => inc(matchId, "PenaltiesA", 1)}>A +1 Pen</button>
          <button onClick={() => inc(matchId, "PenaltiesB", 1)}>B +1 Pen</button>
          <button onClick={() => inc(matchId, "PenaltiesA", -1)}>A Undo</button>
          <button onClick={() => inc(matchId, "PenaltiesB", -1)}>B Undo</button>
        </div>
      </section>

      <section style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Finish Match</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button
            style={{ background: "#28a745", color: "white" }}
            onClick={() => finishMatch(matchId, "A", "points")}
          >
            A Wins (Points)
          </button>
          <button
            style={{ background: "#28a745", color: "white" }}
            onClick={() => finishMatch(matchId, "B", "points")}
          >
            B Wins (Points)
          </button>
          <button
            style={{ background: "#dc3545", color: "white" }}
            onClick={() => finishMatch(matchId, "A", "submission")}
          >
            A Wins (Sub)
          </button>
          <button
            style={{ background: "#dc3545", color: "white" }}
            onClick={() => finishMatch(matchId, "B", "submission")}
          >
            B Wins (Sub)
          </button>
          <button
            style={{ background: "#6c757d", color: "white" }}
            onClick={() => finishMatch(matchId, "A", "ref_decision")}
          >
            A Wins (Ref)
          </button>
          <button
            style={{ background: "#6c757d", color: "white" }}
            onClick={() => finishMatch(matchId, "B", "ref_decision")}
          >
            B Wins (Ref)
          </button>
        </div>
      </section>
    </div>
  );
}
