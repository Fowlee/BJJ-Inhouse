import { useParams } from "react-router-dom";
import { useMatchForMat } from "../hooks/useMatchForMat";
import { ScoringControls } from "../components/scoringControls";

export default function MatScoringPage() {
  const { matId } = useParams<{ matId: string }>();
  const id = matId ?? "";

  const { loading, error, currentMatch, queue } = useMatchForMat(id);

  if (!id) return <div>Missing matId</div>;
  if (loading) return <div>Loading...</div>;
  if (error) return <div style={{ color: "crimson" }}>{error}</div>;
  if (!currentMatch) return <div>No match assigned to {id}.</div>;

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 900, margin: "0 auto" }}>
      <header style={{ display: "grid", gap: 6 }}>
        <h2 style={{ margin: 0 }}>{id.toUpperCase()}</h2>
        <h1 style={{ margin: 0 }}>
          {currentMatch.FighterAName} vs {currentMatch.FighterBName}
        </h1>
        <div style={{ display: "flex", gap: 16 }}>
          <strong>A:</strong> {currentMatch.PointsA} pts / {currentMatch.AdvantagesA} adv /{" "}
          {currentMatch.PenaltiesA} pen
          <span>—</span>
          <strong>B:</strong> {currentMatch.PointsB} pts / {currentMatch.AdvantagesB} adv /{" "}
          {currentMatch.PenaltiesB} pen
        </div>
      </header>

      <ScoringControls matchId={currentMatch.id} />

      <section>
        <h3>Next up</h3>
        {queue.length === 0 ? (
          <div>No queued matches.</div>
        ) : (
          <ol>
            {queue.slice(0, 3).map((m) => (
              <li key={m.id}>
                {m.FighterAName} vs {m.FighterBName} (r{m.Round})
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
