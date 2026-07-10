import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, where, doc, updateDoc, addDoc, deleteDoc, writeBatch, deleteField } from "firebase/firestore";
import { db } from "../assets/firebase";
import type { MatchWithId, BracketWithId } from "../types";
import { BELT_LABELS, BELT_COLORS } from "../types";

export default function BracketView() {
  const { bracketId } = useParams<{ bracketId: string }>();
  const navigate = useNavigate();
  const [bracket, setBracket] = useState<BracketWithId | null>(null);
  const [matches, setMatches] = useState<MatchWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [showParticipants, setShowParticipants] = useState(false);
  const [newFighter, setNewFighter] = useState("");

  useEffect(() => {
    if (!bracketId) return;

    // Load bracket
    const unsubBracket = onSnapshot(doc(db, "brackets", bracketId), (snap) => {
      if (snap.exists()) {
        setBracket({ id: snap.id, ...snap.data() } as BracketWithId);
      }
    });

    // Load matches for this bracket
    const q = query(collection(db, "matches"), where("bracketId", "==", bracketId));
    const unsubMatches = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as MatchWithId));
      setMatches(data);
      setLoading(false);
    });

    return () => {
      unsubBracket();
      unsubMatches();
    };
  }, [bracketId]);

  // Schedule matches so no fighter appears in consecutive matches
  function scheduleWithoutConsecutive(pairings: Array<[string, string]>): Array<[string, string]> {
    const result: Array<[string, string]> = [];
    const remaining = [...pairings];

    while (remaining.length > 0) {
      const lastMatch = result.length > 0 ? result[result.length - 1] : null;
      const lastFighters = lastMatch ? new Set([lastMatch[0], lastMatch[1]]) : new Set<string>();

      // Find best match (neither fighter in last match)
      let bestIndex = -1;
      for (let i = 0; i < remaining.length; i++) {
        const [a, b] = remaining[i];
        if (!lastFighters.has(a) && !lastFighters.has(b)) {
          bestIndex = i;
          break;
        }
      }

      // If no perfect match found, find one with least overlap
      if (bestIndex === -1) {
        let minOverlap = 3;
        for (let i = 0; i < remaining.length; i++) {
          const [a, b] = remaining[i];
          const overlap = (lastFighters.has(a) ? 1 : 0) + (lastFighters.has(b) ? 1 : 0);
          if (overlap < minOverlap) {
            minOverlap = overlap;
            bestIndex = i;
          }
        }
      }

      if (bestIndex === -1) bestIndex = 0;

      result.push(remaining[bestIndex]);
      remaining.splice(bestIndex, 1);
    }

    return result;
  }

  // Regenerate round robin matches for updated participant list
  async function regenerateRoundRobinMatches(participants: string[]) {
    if (!bracket) return;

    // Delete all unfinished matches
    const unfinishedMatches = matches.filter((m) => m.Status !== "finished");
    for (const match of unfinishedMatches) {
      await deleteDoc(doc(db, "matches", match.id));
    }

    const finishedMatches = matches.filter((m) => m.Status === "finished");

    // Count how many times each pairing has been played
    const pairingCounts = new Map<string, number>();
    for (const match of finishedMatches) {
      const key = [match.FighterAName, match.FighterBName].sort().join("__");
      pairingCounts.set(key, (pairingCounts.get(key) || 0) + 1);
    }

    // Special case: 2 fighters = best of 3 (back-to-back unavoidable)
    if (participants.length === 2) {
      let position = finishedMatches.length + 1;
      const key = [participants[0], participants[1]].sort().join("__");
      const alreadyPlayed = pairingCounts.get(key) || 0;

      for (let rep = alreadyPlayed; rep < 3; rep++) {
        await addDoc(collection(db, "matches"), {
          MatId: bracket.matId,
          FighterAName: participants[0],
          FighterBName: participants[1],
          Round: rep + 1,
          PositionInRound: position,
          bracketId: bracket.id,
          bracketRound: rep + 1,
          bracketPosition: position,
          matchDuration: bracket.matchDuration,
          Status: "scheduled",
          PointsA: 0,
          PointsB: 0,
          AdvantagesA: 0,
          AdvantagesB: 0,
          PenaltiesA: 0,
          PenaltiesB: 0,
        });
        position++;
      }
      return;
    }

    // For 3+ fighters, generate pairings that haven't been played yet
    const neededPairings: Array<[string, string]> = [];
    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        const key = [participants[i], participants[j]].sort().join("__");
        const alreadyPlayed = pairingCounts.get(key) || 0;
        if (alreadyPlayed === 0) {
          neededPairings.push([participants[i], participants[j]]);
        }
      }
    }

    // Schedule without consecutive matches for same fighter
    const orderedMatches = scheduleWithoutConsecutive(neededPairings);

    // Create matches in optimized order
    let position = finishedMatches.length + 1;
    for (const [fighterA, fighterB] of orderedMatches) {
      await addDoc(collection(db, "matches"), {
        MatId: bracket.matId,
        FighterAName: fighterA,
        FighterBName: fighterB,
        Round: 1,
        PositionInRound: position,
        bracketId: bracket.id,
        bracketRound: 1,
        bracketPosition: position,
        matchDuration: bracket.matchDuration,
        Status: "scheduled",
        PointsA: 0,
        PointsB: 0,
        AdvantagesA: 0,
        AdvantagesB: 0,
        PenaltiesA: 0,
        PenaltiesB: 0,
      });
      position++;
    }
  }

  // Fix match order for existing round robin brackets (no back-to-back fights)
  async function fixMatchOrder() {
    if (!bracket || bracket.format !== "round_robin") return;

    const scheduledMatches = matches.filter((m) => m.Status === "scheduled");
    if (scheduledMatches.length < 2) return;

    // Special case: 2 fighters - nothing to fix
    if (bracket.participants.length === 2) {
      alert("With only 2 fighters, back-to-back matches are unavoidable.");
      return;
    }

    // Get pairings from scheduled matches
    const pairings: Array<[string, string, string]> = scheduledMatches.map((m) => [
      m.FighterAName,
      m.FighterBName,
      m.id,
    ]);

    // Reorder to avoid consecutive matches for same fighter
    const reordered = scheduleMatchesWithoutConsecutive(pairings);

    // Update bracketPosition (within-bracket ordering) and clear any queueOrder
    const batch = writeBatch(db);
    reordered.forEach(([, , matchId], index) => {
      batch.update(doc(db, "matches", matchId), {
        bracketPosition: index + 1,
        PositionInRound: index + 1,
        queueOrder: deleteField(), // Remove mat-level ordering field
      });
    });
    await batch.commit();

    alert("Match order updated! No fighter will have back-to-back matches.");
  }

  // Schedule matches so no fighter appears in consecutive matches (with match IDs)
  function scheduleMatchesWithoutConsecutive(
    pairings: Array<[string, string, string]>
  ): Array<[string, string, string]> {
    const result: Array<[string, string, string]> = [];
    const remaining = [...pairings];

    while (remaining.length > 0) {
      const lastMatch = result.length > 0 ? result[result.length - 1] : null;
      const lastFighters = lastMatch ? new Set([lastMatch[0], lastMatch[1]]) : new Set<string>();

      // Find best match (neither fighter in last match)
      let bestIndex = -1;
      for (let i = 0; i < remaining.length; i++) {
        const [a, b] = remaining[i];
        if (!lastFighters.has(a) && !lastFighters.has(b)) {
          bestIndex = i;
          break;
        }
      }

      // If no perfect match found, find one with least overlap
      if (bestIndex === -1) {
        let minOverlap = 3;
        for (let i = 0; i < remaining.length; i++) {
          const [a, b] = remaining[i];
          const overlap = (lastFighters.has(a) ? 1 : 0) + (lastFighters.has(b) ? 1 : 0);
          if (overlap < minOverlap) {
            minOverlap = overlap;
            bestIndex = i;
          }
        }
      }

      if (bestIndex === -1) bestIndex = 0;

      result.push(remaining[bestIndex]);
      remaining.splice(bestIndex, 1);
    }

    return result;
  }

  async function addFighter() {
    if (!bracket || !newFighter.trim()) return;

    const fighterName = newFighter.trim();

    // Check if fighter already exists
    if (bracket.participants.includes(fighterName)) {
      alert("Fighter already in bracket");
      return;
    }

    // Update bracket participants
    const updatedParticipants = [...bracket.participants, fighterName];
    await updateDoc(doc(db, "brackets", bracket.id), {
      participants: updatedParticipants,
    });

    // For round robin, regenerate all matches
    if (bracket.format === "round_robin") {
      await regenerateRoundRobinMatches(updatedParticipants);
    }

    setNewFighter("");
  }

  async function removeFighter(fighterName: string) {
    if (!bracket) return;

    if (bracket.format === "double_elimination") {
      alert("Cannot remove fighters from double elimination brackets. Their matches will need to be handled manually.");
      return;
    }

    if (!confirm(`Remove ${fighterName} from the bracket? Unfinished matches will be regenerated.`)) {
      return;
    }

    // Remove from participants
    const updatedParticipants = bracket.participants.filter((p) => p !== fighterName);
    await updateDoc(doc(db, "brackets", bracket.id), {
      participants: updatedParticipants,
    });

    // Delete finished matches involving this fighter (they're out)
    const fighterFinishedMatches = matches.filter(
      (m) =>
        (m.FighterAName === fighterName || m.FighterBName === fighterName) &&
        m.Status === "finished"
    );
    for (const match of fighterFinishedMatches) {
      await deleteDoc(doc(db, "matches", match.id));
    }

    // Regenerate remaining matches
    await regenerateRoundRobinMatches(updatedParticipants);
  }

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>;
  if (!bracket) return <div style={{ padding: 40 }}>Bracket not found</div>;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    return `${mins} min`;
  };

  const beltColor = bracket.belt ? BELT_COLORS[bracket.belt] : "#666";
  const beltLabel = bracket.belt ? BELT_LABELS[bracket.belt] : "";

  return (
    <div style={{ padding: 20, minHeight: "100vh", background: "#121212" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Belt color indicator */}
          {bracket.belt && (
            <div style={{
              width: 8,
              height: 60,
              background: beltColor,
              borderRadius: 4,
            }} />
          )}
          <div>
            <h1 style={{ margin: 0 }}>{bracket.name}</h1>
            <div style={{ color: "#888", fontSize: "0.875rem", marginTop: 4 }}>
              {bracket.format === "double_elimination" ? "Double Elimination" : "Round Robin"} •{" "}
              {bracket.participants.length} fighters •{" "}
              {formatDuration(bracket.matchDuration || 300)} matches
              {beltLabel && ` • ${beltLabel} Belt`}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {bracket.format === "round_robin" && bracket.participants.length > 2 && (
            <button
              onClick={fixMatchOrder}
              style={{ padding: "8px 16px", background: "#28a745" }}
            >
              Fix Match Order
            </button>
          )}
          <button
            onClick={() => setShowParticipants(!showParticipants)}
            style={{ padding: "8px 16px", background: showParticipants ? "#0d6efd" : "#333" }}
          >
            {showParticipants ? "Hide Fighters" : "Manage Fighters"}
          </button>
          <button onClick={() => navigate("/dashboard")} style={{ padding: "8px 16px" }}>
            Back to Admin
          </button>
        </div>
      </header>

      {/* Participants Management */}
      {showParticipants && (
        <div style={{
          background: "#1a1a1a",
          padding: 20,
          borderRadius: 8,
          marginBottom: 24,
        }}>
          <h3 style={{ margin: "0 0 16px 0" }}>Fighters</h3>

          {/* Add Fighter */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              type="text"
              value={newFighter}
              onChange={(e) => setNewFighter(e.target.value)}
              placeholder="New fighter name"
              style={{ flex: 1, padding: "8px 12px" }}
              onKeyDown={(e) => e.key === "Enter" && addFighter()}
            />
            <button onClick={addFighter} style={{ padding: "8px 16px" }}>
              Add Fighter
            </button>
          </div>

          {/* Fighter List */}
          <div style={{ display: "grid", gap: 8 }}>
            {bracket.participants.map((fighter) => {
              const fighterMatches = matches.filter(
                (m) => m.FighterAName === fighter || m.FighterBName === fighter
              );
              const wins = fighterMatches.filter(
                (m) =>
                  m.Status === "finished" &&
                  ((m.WinnerId === "fighterA" && m.FighterAName === fighter) ||
                    (m.WinnerId === "fighterB" && m.FighterBName === fighter))
              ).length;
              const losses = fighterMatches.filter(
                (m) =>
                  m.Status === "finished" &&
                  ((m.WinnerId === "fighterA" && m.FighterBName === fighter) ||
                    (m.WinnerId === "fighterB" && m.FighterAName === fighter))
              ).length;

              return (
                <div
                  key={fighter}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    background: "#2a2a2a",
                    borderRadius: 4,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{fighter}</span>
                    <span style={{ color: "#888", marginLeft: 12, fontSize: "0.875rem" }}>
                      {wins}W - {losses}L
                    </span>
                  </div>
                  <button
                    onClick={() => removeFighter(fighter)}
                    style={{
                      padding: "4px 12px",
                      background: "#dc3545",
                      color: "white",
                      fontSize: "0.875rem",
                    }}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>

          {bracket.format === "double_elimination" && (
            <div style={{ marginTop: 12, fontSize: "0.875rem", color: "#888" }}>
              Note: Adding fighters to double elimination brackets won't auto-generate matches.
              Remove fighter is disabled for double elimination.
            </div>
          )}
        </div>
      )}

      {bracket.format === "double_elimination" ? (
        <DoubleEliminationBracket matches={matches} />
      ) : (
        <RoundRobinBracket matches={matches} participants={bracket.participants} />
      )}
    </div>
  );
}

function DoubleEliminationBracket({ matches }: { matches: MatchWithId[] }) {
  // Separate matches by bracket side
  const winnersMatches = matches.filter((m) => m.bracketSide === "winners");
  const losersMatches = matches.filter((m) => m.bracketSide === "losers");
  const grandFinalMatches = matches.filter((m) => m.bracketSide === "grand_final" || m.bracketSide === "true_final");

  // Group winners matches by round
  const winnersRounds = new Map<number, MatchWithId[]>();
  winnersMatches.forEach((m) => {
    const round = m.bracketRound ?? 1;
    if (!winnersRounds.has(round)) winnersRounds.set(round, []);
    winnersRounds.get(round)!.push(m);
  });

  // Group losers matches by round
  const losersRounds = new Map<number, MatchWithId[]>();
  losersMatches.forEach((m) => {
    const round = m.bracketRound ?? 1;
    if (!losersRounds.has(round)) losersRounds.set(round, []);
    losersRounds.get(round)!.push(m);
  });

  // Sort matches within each round by position
  winnersRounds.forEach((roundMatches) => {
    roundMatches.sort((a, b) => (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0));
  });
  losersRounds.forEach((roundMatches) => {
    roundMatches.sort((a, b) => (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0));
  });

  const winnersRoundNumbers = Array.from(winnersRounds.keys()).sort((a, b) => a - b);
  const losersRoundNumbers = Array.from(losersRounds.keys()).sort((a, b) => a - b);
  const totalWinnersRounds = winnersRoundNumbers.length;

  const getWinnersRoundName = (round: number) => {
    if (round === totalWinnersRounds) return "Winners Final";
    if (round === totalWinnersRounds - 1) return "Winners Semi";
    return `Winners R${round}`;
  };

  const getLosersRoundName = (round: number) => {
    if (round === losersRoundNumbers[losersRoundNumbers.length - 1]) return "Losers Final";
    return `Losers R${round}`;
  };

  return (
    <div style={{ display: "grid", gap: 32 }}>
      {/* Winners Bracket */}
      <div>
        <h2 style={{ margin: "0 0 16px 0", color: "#28a745" }}>Winners Bracket</h2>
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 24, minWidth: "max-content" }}>
            {winnersRoundNumbers.map((roundNum) => {
              const roundMatches = winnersRounds.get(roundNum) ?? [];
              const spacing = Math.pow(2, roundNum - 1);

              return (
                <div key={roundNum} style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{
                    textAlign: "center",
                    fontWeight: 700,
                    marginBottom: 12,
                    color: "#28a745",
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                  }}>
                    {getWinnersRoundName(roundNum)}
                  </div>
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-around",
                    flex: 1,
                    gap: spacing * 8,
                  }}>
                    {roundMatches.map((match) => (
                      <MatchCard key={match.id} match={match} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Losers Bracket */}
      {losersMatches.length > 0 && (
        <div>
          <h2 style={{ margin: "0 0 16px 0", color: "#dc3545" }}>Losers Bracket</h2>
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "flex", gap: 24, minWidth: "max-content" }}>
              {losersRoundNumbers.map((roundNum) => {
                const roundMatches = losersRounds.get(roundNum) ?? [];

                return (
                  <div key={roundNum} style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{
                      textAlign: "center",
                      fontWeight: 700,
                      marginBottom: 12,
                      color: "#dc3545",
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                    }}>
                      {getLosersRoundName(roundNum)}
                    </div>
                    <div style={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-around",
                      flex: 1,
                      gap: 8,
                    }}>
                      {roundMatches.map((match) => (
                        <MatchCard key={match.id} match={match} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Grand Final */}
      {grandFinalMatches.length > 0 && (
        <div>
          <h2 style={{ margin: "0 0 16px 0", color: "#ffc107" }}>Grand Final</h2>
          <div style={{ display: "flex", gap: 16 }}>
            {grandFinalMatches.map((match) => (
              <div key={match.id}>
                <div style={{
                  fontSize: "0.75rem",
                  color: "#888",
                  marginBottom: 8,
                  textTransform: "uppercase",
                }}>
                  {match.bracketSide === "true_final" ? "True Final (Reset)" : "Grand Final"}
                </div>
                <MatchCard match={match} />
              </div>
            ))}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#666", marginTop: 8 }}>
            Winners bracket champion (top) vs Losers bracket champion (bottom)
          </div>
        </div>
      )}
    </div>
  );
}

function RoundRobinBracket({ matches, participants }: { matches: MatchWithId[]; participants: string[] }) {
  // Calculate standings
  const standings = new Map<string, { wins: number; losses: number; points: number }>();
  participants.forEach((p) => standings.set(p, { wins: 0, losses: 0, points: 0 }));

  matches.forEach((m) => {
    if (m.Status !== "finished" || !m.WinnerId) return;

    const winner = m.WinnerId === "fighterA" ? m.FighterAName : m.FighterBName;
    const loser = m.WinnerId === "fighterA" ? m.FighterBName : m.FighterAName;

    const winnerStats = standings.get(winner);
    const loserStats = standings.get(loser);

    if (winnerStats) {
      winnerStats.wins++;
      winnerStats.points += m.WinMethod === "submission" ? 3 : 2;
    }
    if (loserStats) {
      loserStats.losses++;
    }
  });

  // Sort by points, then wins
  const sortedStandings = Array.from(standings.entries()).sort((a, b) => {
    if (b[1].points !== a[1].points) return b[1].points - a[1].points;
    return b[1].wins - a[1].wins;
  });

  return (
    <div style={{ display: "grid", gap: 32 }}>
      {/* Standings Table */}
      <div>
        <h2 style={{ margin: "0 0 16px 0" }}>Standings</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", background: "#1a1a1a", borderRadius: 8 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #333" }}>
              <th style={{ padding: 12, textAlign: "left" }}>#</th>
              <th style={{ padding: 12, textAlign: "left" }}>Fighter</th>
              <th style={{ padding: 12, textAlign: "center" }}>W</th>
              <th style={{ padding: 12, textAlign: "center" }}>L</th>
              <th style={{ padding: 12, textAlign: "center" }}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {sortedStandings.map(([name, stats], i) => (
              <tr key={name} style={{ borderBottom: "1px solid #333" }}>
                <td style={{ padding: 12 }}>{i + 1}</td>
                <td style={{ padding: 12, fontWeight: 600 }}>{name}</td>
                <td style={{ padding: 12, textAlign: "center", color: "#28a745" }}>{stats.wins}</td>
                <td style={{ padding: 12, textAlign: "center", color: "#dc3545" }}>{stats.losses}</td>
                <td style={{ padding: 12, textAlign: "center", fontWeight: 700 }}>{stats.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: "0.75rem", color: "#666", marginTop: 8 }}>
          Points: Submission = 3pts, Other wins = 2pts
        </div>
      </div>

      {/* Match List */}
      <div>
        <h2 style={{ margin: "0 0 16px 0" }}>Matches</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchCard({ match }: { match: MatchWithId }) {
  const isFinished = match.Status === "finished";
  const winnerIsA = match.WinnerId === "fighterA";
  const winnerIsB = match.WinnerId === "fighterB";
  const isTBD = match.FighterAName === "TBD" || match.FighterBName === "TBD";

  return (
    <div style={{
      background: "#1a1a1a",
      borderRadius: 8,
      overflow: "hidden",
      minWidth: 200,
      opacity: isTBD ? 0.6 : 1,
    }}>
      {/* Fighter A */}
      <div style={{
        padding: "10px 12px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: isFinished && winnerIsA ? "#28a74533" : "transparent",
        borderLeft: isFinished && winnerIsA ? "4px solid #28a745" : "4px solid transparent",
      }}>
        <span style={{ fontWeight: isFinished && winnerIsA ? 700 : 400 }}>
          {match.FighterAName}
        </span>
        {isFinished && (
          <span style={{ fontWeight: 600 }}>{match.PointsA}</span>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "#333" }} />

      {/* Fighter B */}
      <div style={{
        padding: "10px 12px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: isFinished && winnerIsB ? "#28a74533" : "transparent",
        borderLeft: isFinished && winnerIsB ? "4px solid #28a745" : "4px solid transparent",
      }}>
        <span style={{ fontWeight: isFinished && winnerIsB ? 700 : 400 }}>
          {match.FighterBName}
        </span>
        {isFinished && (
          <span style={{ fontWeight: 600 }}>{match.PointsB}</span>
        )}
      </div>

      {/* Status */}
      {!isFinished && !isTBD && (
        <div style={{
          padding: "6px 12px",
          background: match.Status === "in_progress" ? "#ffc10733" : "#333",
          fontSize: "0.75rem",
          textAlign: "center",
          color: match.Status === "in_progress" ? "#ffc107" : "#888",
          textTransform: "uppercase",
        }}>
          {match.Status === "in_progress" ? "In Progress" : "Scheduled"}
        </div>
      )}

      {isFinished && match.WinMethod && (
        <div style={{
          padding: "6px 12px",
          background: "#333",
          fontSize: "0.75rem",
          textAlign: "center",
          color: "#888",
          textTransform: "uppercase",
        }}>
          {match.WinMethod === "submission" ? "SUB" : match.WinMethod === "points" ? "PTS" : "REF"}
        </div>
      )}
    </div>
  );
}
