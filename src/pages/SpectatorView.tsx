import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { collection, onSnapshot, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "../assets/firebase";
import type { MatchWithId, BracketWithId, AgeGroup, WeightClass, Belt, TournamentSettings } from "../types";
import { AGE_GROUP_LABELS, AGE_GROUP_ORDER, BELT_LABELS, BELT_COLORS, WEIGHT_CLASSES, DEFAULT_TOURNAMENT_SETTINGS } from "../types";
import { calculateAllTimeEstimates, formatEstimatedTime } from "../utils/timeEstimates";
import type { MatchTimeEstimate } from "../utils/timeEstimates";

export default function SpectatorView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("fighter") || "");
  const [selectedFighter, setSelectedFighter] = useState<string | null>(searchParams.get("fighter") || null);
  const [selectedBracket, setSelectedBracket] = useState<BracketWithId | null>(null);
  const [brackets, setBrackets] = useState<BracketWithId[]>([]);
  const [matches, setMatches] = useState<MatchWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [tournamentSettings, setTournamentSettings] = useState<TournamentSettings>(DEFAULT_TOURNAMENT_SETTINGS);

  // Load all active brackets and their matches
  useEffect(() => {
    // Load tournament settings
    getDoc(doc(db, "settings", "tournament")).then((snap) => {
      if (snap.exists()) {
        setTournamentSettings(snap.data() as TournamentSettings);
      }
    });

    const bracketsQuery = query(
      collection(db, "brackets"),
      where("status", "in", ["pending", "active"])
    );

    const unsubBrackets = onSnapshot(bracketsQuery, (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as BracketWithId));
      setBrackets(data);
    });

    const matchesQuery = query(collection(db, "matches"));
    const unsubMatches = onSnapshot(matchesQuery, (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as MatchWithId));
      setMatches(data);
      setLoading(false);
    });

    return () => {
      unsubBrackets();
      unsubMatches();
    };
  }, []);

  // Calculate time estimates for all matches (ordered by age group per mat)
  const timeEstimates = useMemo(() => {
    return calculateAllTimeEstimates(matches, brackets, tournamentSettings);
  }, [matches, brackets, tournamentSettings]);

  // Get all unique fighter names
  const allFighters = useMemo(() => {
    const names = new Set<string>();
    brackets.forEach((b) => {
      b.participants.forEach((p) => {
        if (p && p !== "TBD" && p !== "BYE") {
          names.add(p);
        }
      });
    });
    return Array.from(names).sort();
  }, [brackets]);

  // Filter fighters based on search
  const filteredFighters = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return allFighters.filter((f) => f.toLowerCase().includes(query));
  }, [allFighters, searchQuery]);

  // Get fighter's matches
  const fighterMatches = useMemo(() => {
    if (!selectedFighter) return { current: null, upcoming: [], past: [] };

    const fighterMatchList = matches.filter(
      (m) => m.FighterAName === selectedFighter || m.FighterBName === selectedFighter
    );

    const current = fighterMatchList.find((m) => m.Status === "in_progress") || null;

    const upcoming = fighterMatchList
      .filter((m) => m.Status === "scheduled" && m.FighterAName !== "TBD" && m.FighterBName !== "TBD")
      .sort((a, b) => {
        if (a.Round !== b.Round) return a.Round - b.Round;
        return a.PositionInRound - b.PositionInRound;
      });

    const past = fighterMatchList
      .filter((m) => m.Status === "finished")
      .sort((a, b) => {
        if (b.Round !== a.Round) return b.Round - a.Round;
        return b.PositionInRound - a.PositionInRound;
      });

    return { current, upcoming, past };
  }, [selectedFighter, matches]);

  // Get fighter's bracket info
  const fighterBracket = useMemo(() => {
    if (!selectedFighter) return null;
    return brackets.find((b) => b.participants.includes(selectedFighter)) || null;
  }, [selectedFighter, brackets]);

  // Helper to get age group order
  const getAgeGroupOrder = (ageGroup: AgeGroup): number => {
    const index = AGE_GROUP_ORDER.indexOf(ageGroup);
    return index >= 0 ? index : 999;
  };

  // Calculate queue position (sorted by age group, youngest first - entire mat queue)
  const queuePosition = useMemo(() => {
    if (!selectedFighter || !fighterBracket) return null;

    // Create a map of bracketId -> bracket for quick lookup
    const bracketMap = new Map<string, BracketWithId>();
    for (const b of brackets) {
      bracketMap.set(b.id, b);
    }

    // Get all scheduled/in_progress matches for this mat, sorted by age group (queueOrder only when both have it)
    const matMatches = matches
      .filter((m) => m.MatId === fighterBracket.matId && (m.Status === "scheduled" || m.Status === "in_progress"))
      .sort((a, b) => {
        // Only use queueOrder if BOTH matches have it set
        if (a.queueOrder !== undefined && b.queueOrder !== undefined) {
          return a.queueOrder - b.queueOrder;
        }

        // Otherwise, use age-group-based sorting
        const bracketA = a.bracketId ? bracketMap.get(a.bracketId) : null;
        const bracketB = b.bracketId ? bracketMap.get(b.bracketId) : null;

        // Get age group order (youngest first)
        const ageOrderA = bracketA ? getAgeGroupOrder(bracketA.ageGroup) : 999;
        const ageOrderB = bracketB ? getAgeGroupOrder(bracketB.ageGroup) : 999;
        if (ageOrderA !== ageOrderB) return ageOrderA - ageOrderB;

        // Same age group - sort by bracket ID to keep same bracket together
        if (a.bracketId !== b.bracketId) {
          return (a.bracketId || "").localeCompare(b.bracketId || "");
        }

        // Same bracket - sort by bracket side (winners, losers, finals)
        const sideOrder = { winners: 0, losers: 1, grand_final: 2, true_final: 3 };
        const sideA = sideOrder[a.bracketSide || "winners"] ?? 0;
        const sideB = sideOrder[b.bracketSide || "winners"] ?? 0;
        if (sideA !== sideB) return sideA - sideB;

        // Same side - sort by round
        const roundA = a.bracketRound ?? a.Round ?? 0;
        const roundB = b.bracketRound ?? b.Round ?? 0;
        if (roundA !== roundB) return roundA - roundB;

        // Same round - sort by position
        return (a.bracketPosition ?? a.PositionInRound ?? 0) - (b.bracketPosition ?? b.PositionInRound ?? 0);
      });

    // Find the first scheduled match for this fighter (skip in_progress matches of other fighters)
    let position = 0;
    for (const match of matMatches) {
      const isFighterMatch = match.FighterAName === selectedFighter || match.FighterBName === selectedFighter;

      if (match.Status === "in_progress") {
        if (isFighterMatch) {
          return 0; // Fighter is currently fighting
        }
        // Someone else is fighting, don't count this match
        continue;
      }

      position++;
      if (isFighterMatch) {
        return position;
      }
    }

    return null;
  }, [selectedFighter, fighterBracket, matches, brackets]);

  function selectFighter(name: string) {
    setSelectedFighter(name);
    setSearchParams({ fighter: name });
    setSearchQuery(name);
  }

  function clearSelection() {
    setSelectedFighter(null);
    setSearchParams({});
    setSearchQuery("");
  }

  const getWeightLabel = (ageGroup: AgeGroup, weightClass: WeightClass) => {
    const info = WEIGHT_CLASSES[ageGroup]?.[weightClass];
    if (!info) return weightClass;
    return info.maxKg ? `${info.shortName} (-${info.maxKg}kg)` : info.shortName;
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", minHeight: "100vh", background: "#121212" }}>
        <div style={{ fontSize: "1.25rem", color: "#888" }}>Loading brackets...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, minHeight: "100vh", background: "#121212", overflowX: "hidden" }}>
      {/* Header */}
      <header style={{ marginBottom: 24, textAlign: "center" }}>
        <h1 style={{ margin: "0 0 8px 0", fontSize: "1.75rem" }}>Live Tournament</h1>
        <p style={{ margin: 0, color: "#888" }}>Find your fighter and track their matches</p>
      </header>

      {/* Search Box */}
      <div style={{ maxWidth: 500, margin: "0 auto 32px auto" }}>
        <div style={{ position: "relative" }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!e.target.value.trim()) {
                setSelectedFighter(null);
                setSearchParams({});
              }
            }}
            placeholder="Search fighter name..."
            style={{
              width: "100%",
              padding: "16px 20px",
              fontSize: "1.125rem",
              background: "#1a1a1a",
              border: "2px solid #333",
              borderRadius: 12,
              color: "white",
              boxSizing: "border-box",
            }}
          />
          {selectedFighter && (
            <button
              onClick={clearSelection}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                background: "#333",
                border: "none",
                borderRadius: 6,
                padding: "8px 12px",
                color: "#888",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Search Results Dropdown */}
        {searchQuery && !selectedFighter && filteredFighters.length > 0 && (
          <div style={{
            background: "#1a1a1a",
            border: "1px solid #333",
            borderRadius: 8,
            marginTop: 8,
            maxHeight: 200,
            overflowY: "auto",
          }}>
            {filteredFighters.map((fighter) => (
              <button
                key={fighter}
                onClick={() => selectFighter(fighter)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid #333",
                  color: "white",
                  cursor: "pointer",
                  fontSize: "1rem",
                }}
              >
                {fighter}
              </button>
            ))}
          </div>
        )}

        {searchQuery && !selectedFighter && filteredFighters.length === 0 && (
          <div style={{ textAlign: "center", padding: 16, color: "#888" }}>
            No fighters found matching "{searchQuery}"
          </div>
        )}
      </div>

      {/* Fighter Dashboard */}
      {selectedFighter && (
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          {/* Fighter Header */}
          <div style={{
            background: "#1a1a1a",
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
            textAlign: "center",
          }}>
            <h2 style={{ margin: "0 0 8px 0", fontSize: "1.5rem" }}>{selectedFighter}</h2>
            {fighterBracket && (
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <span style={{
                  padding: "4px 12px",
                  background: BELT_COLORS[fighterBracket.belt as Belt] || "#333",
                  color: fighterBracket.belt === "white" || fighterBracket.belt === "yellow" ? "#000" : "#fff",
                  borderRadius: 20,
                  fontSize: "0.875rem",
                  fontWeight: 600,
                }}>
                  {BELT_LABELS[fighterBracket.belt as Belt]} Belt
                </span>
                <span style={{
                  padding: "4px 12px",
                  background: "#333",
                  borderRadius: 20,
                  fontSize: "0.875rem",
                }}>
                  {AGE_GROUP_LABELS[fighterBracket.ageGroup as AgeGroup]}
                </span>
                <span style={{
                  padding: "4px 12px",
                  background: "#333",
                  borderRadius: 20,
                  fontSize: "0.875rem",
                }}>
                  {getWeightLabel(fighterBracket.ageGroup as AgeGroup, fighterBracket.weightClass as WeightClass)}
                </span>
              </div>
            )}
          </div>

          {/* Current Match - LIVE */}
          {fighterMatches.current && (
            <div style={{
              background: "linear-gradient(135deg, #dc354522, #ffc10722)",
              border: "2px solid #ffc107",
              borderRadius: 12,
              padding: 20,
              marginBottom: 16,
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}>
                <div style={{
                  width: 12,
                  height: 12,
                  background: "#dc3545",
                  borderRadius: "50%",
                  animation: "pulse 1.5s infinite",
                }} />
                <span style={{ fontWeight: 700, color: "#ffc107", textTransform: "uppercase" }}>
                  Live Now - Mat {fighterMatches.current.MatId}
                </span>
              </div>
              <LiveMatchCard match={fighterMatches.current} highlightFighter={selectedFighter} />
            </div>
          )}

          {/* Up Next */}
          {!fighterMatches.current && queuePosition && fighterMatches.upcoming[0] && (
            <div style={{
              background: "#1a1a1a",
              border: "2px solid #0d6efd",
              borderRadius: 12,
              padding: 20,
              marginBottom: 16,
              textAlign: "center",
            }}>
              <div style={{ fontSize: "3rem", fontWeight: 700, color: "#0d6efd" }}>
                #{queuePosition}
              </div>
              <div style={{ color: "#888" }}>
                {queuePosition === 1 ? "Up next!" : `${queuePosition - 1} match${queuePosition > 2 ? "es" : ""} until fight`}
              </div>
              {timeEstimates.get(fighterMatches.upcoming[0].id) && (
                <div style={{ marginTop: 8, fontSize: "1.125rem", color: "#0d6efd" }}>
                  ~{formatEstimatedTime(timeEstimates.get(fighterMatches.upcoming[0].id)!.estimatedStartTime)}
                </div>
              )}
              {fighterBracket && (
                <div style={{ marginTop: 8, color: "#666", fontSize: "0.875rem" }}>
                  Mat {fighterBracket.matId.replace("mat", "")}
                </div>
              )}
            </div>
          )}

          {/* Upcoming Matches */}
          {fighterMatches.upcoming.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ margin: "0 0 12px 0", color: "#888", fontSize: "0.875rem", textTransform: "uppercase" }}>
                Upcoming Matches ({fighterMatches.upcoming.length})
              </h3>
              <div style={{ display: "grid", gap: 8 }}>
                {fighterMatches.upcoming.map((match) => (
                  <ScheduledMatchCard
                    key={match.id}
                    match={match}
                    highlightFighter={selectedFighter}
                    timeEstimate={timeEstimates.get(match.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Past Results */}
          {fighterMatches.past.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ margin: "0 0 12px 0", color: "#888", fontSize: "0.875rem", textTransform: "uppercase" }}>
                Results ({fighterMatches.past.length})
              </h3>
              <div style={{ display: "grid", gap: 8 }}>
                {fighterMatches.past.map((match) => (
                  <ResultMatchCard key={match.id} match={match} highlightFighter={selectedFighter} />
                ))}
              </div>
            </div>
          )}

          {/* No matches state */}
          {!fighterMatches.current && fighterMatches.upcoming.length === 0 && fighterMatches.past.length === 0 && (
            <div style={{
              background: "#1a1a1a",
              borderRadius: 12,
              padding: 32,
              textAlign: "center",
              color: "#888",
            }}>
              No matches scheduled yet
            </div>
          )}
        </div>
      )}

      {/* Browse All Brackets (when no fighter selected) */}
      {!selectedFighter && !selectedBracket && (
        <div>
          <h2 style={{ margin: "0 0 16px 0", textAlign: "center" }}>Active Brackets</h2>
          {brackets.length === 0 ? (
            <div style={{ textAlign: "center", color: "#888", padding: 32 }}>
              No active brackets at the moment
            </div>
          ) : (
            (() => {
              // Group brackets by mat
              const bracketsByMat = new Map<string, BracketWithId[]>();
              brackets.forEach((b) => {
                if (!bracketsByMat.has(b.matId)) {
                  bracketsByMat.set(b.matId, []);
                }
                bracketsByMat.get(b.matId)!.push(b);
              });

              // Sort brackets within each mat by age group (youngest first)
              bracketsByMat.forEach((matBrackets) => {
                matBrackets.sort((a, b) =>
                  AGE_GROUP_ORDER.indexOf(a.ageGroup) - AGE_GROUP_ORDER.indexOf(b.ageGroup)
                );
              });

              // Get sorted mat IDs
              const sortedMatIds = Array.from(bracketsByMat.keys()).sort();

              return (
                <div className="mats-grid" style={{
                  display: "grid",
                  gap: 24,
                  maxWidth: 1200,
                  margin: "0 auto",
                }}>
                  {sortedMatIds.map((matId) => (
                    <div key={matId}>
                      {/* Mat Header */}
                      <div style={{
                        background: "#0d6efd",
                        color: "#fff",
                        padding: "12px 16px",
                        borderRadius: "12px 12px 0 0",
                        fontWeight: 700,
                        fontSize: "1.125rem",
                        textAlign: "center",
                      }}>
                        Mat {matId.replace("mat", "")}
                      </div>

                      {/* Brackets in this mat */}
                      <div style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                        background: "#1a1a1a",
                        borderRadius: "0 0 12px 12px",
                        padding: 12,
                        minHeight: 200,
                      }}>
                        {bracketsByMat.get(matId)!.map((bracket) => (
                          <BracketCard
                            key={bracket.id}
                            bracket={bracket}
                            matches={matches.filter((m) => m.bracketId === bracket.id)}
                            onSelectFighter={selectFighter}
                            onViewBracket={() => setSelectedBracket(bracket)}
                            timeEstimates={timeEstimates}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Full Bracket View */}
      {!selectedFighter && selectedBracket && (
        <div>
          <button
            onClick={() => setSelectedBracket(null)}
            style={{
              marginBottom: 16,
              padding: "8px 16px",
              background: "#333",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            ← Back to Brackets
          </button>

          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 24,
          }}>
            <div style={{
              width: 8,
              height: 60,
              background: BELT_COLORS[selectedBracket.belt as Belt] || "#666",
              borderRadius: 4,
            }} />
            <div>
              <h2 style={{ margin: 0 }}>{selectedBracket.name}</h2>
              <div style={{ color: "#888", fontSize: "0.875rem", marginTop: 4 }}>
                {selectedBracket.format === "double_elimination" ? "Double Elimination" : "Round Robin"} •{" "}
                {selectedBracket.participants.length} fighters •{" "}
                {Math.floor((selectedBracket.matchDuration || 300) / 60)} min matches •{" "}
                Mat {selectedBracket.matId.replace("mat", "")}
              </div>
            </div>
          </div>

          {selectedBracket.format === "double_elimination" ? (
            <DoubleEliminationBracket
              matches={matches.filter((m) => m.bracketId === selectedBracket.id)}
              timeEstimates={timeEstimates}
              onSelectFighter={selectFighter}
            />
          ) : (
            <RoundRobinBracket
              matches={matches.filter((m) => m.bracketId === selectedBracket.id)}
              participants={selectedBracket.participants}
              timeEstimates={timeEstimates}
              onSelectFighter={selectFighter}
            />
          )}
        </div>
      )}

      {/* Pulse animation for live indicator */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .mats-grid {
          grid-template-columns: repeat(3, 1fr);
        }
        @media (max-width: 900px) {
          .mats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 600px) {
          .mats-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

function LiveMatchCard({ match, highlightFighter }: { match: MatchWithId; highlightFighter: string }) {
  const isA = match.FighterAName === highlightFighter;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {/* Fighter A */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 16px",
        background: isA ? "#0d6efd33" : "#2a2a2a",
        borderRadius: 8,
        borderLeft: isA ? "4px solid #0d6efd" : "4px solid transparent",
      }}>
        <span style={{ fontWeight: isA ? 700 : 400, fontSize: "1.125rem" }}>
          {match.FighterAName}
        </span>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", color: "#888" }}>
            A{match.AdvantagesA} P{match.PenaltiesA}
          </span>
          <span style={{ fontSize: "2rem", fontWeight: 700 }}>{match.PointsA}</span>
        </div>
      </div>

      {/* VS */}
      <div style={{ textAlign: "center", color: "#666", fontSize: "0.75rem" }}>VS</div>

      {/* Fighter B */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 16px",
        background: !isA ? "#0d6efd33" : "#2a2a2a",
        borderRadius: 8,
        borderLeft: !isA ? "4px solid #0d6efd" : "4px solid transparent",
      }}>
        <span style={{ fontWeight: !isA ? 700 : 400, fontSize: "1.125rem" }}>
          {match.FighterBName}
        </span>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", color: "#888" }}>
            A{match.AdvantagesB} P{match.PenaltiesB}
          </span>
          <span style={{ fontSize: "2rem", fontWeight: 700 }}>{match.PointsB}</span>
        </div>
      </div>
    </div>
  );
}

function ScheduledMatchCard({
  match,
  highlightFighter,
  timeEstimate,
}: {
  match: MatchWithId;
  highlightFighter: string;
  timeEstimate?: MatchTimeEstimate;
}) {
  const opponent = match.FighterAName === highlightFighter ? match.FighterBName : match.FighterAName;

  return (
    <div style={{
      background: "#1a1a1a",
      borderRadius: 8,
      padding: "12px 16px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    }}>
      <div>
        <span style={{ color: "#888", fontSize: "0.875rem" }}>vs </span>
        <span style={{ fontWeight: 600 }}>{opponent}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {timeEstimate && (
          <span style={{
            padding: "4px 8px",
            background: "#0d6efd22",
            borderRadius: 4,
            fontSize: "0.75rem",
            color: "#0d6efd",
          }}>
            ~{formatEstimatedTime(timeEstimate.estimatedStartTime)}
          </span>
        )}
        <span style={{
          padding: "4px 8px",
          background: "#333",
          borderRadius: 4,
          fontSize: "0.75rem",
          color: "#888",
        }}>
          Mat {match.MatId.replace("mat", "")}
        </span>
      </div>
    </div>
  );
}

function ResultMatchCard({ match, highlightFighter }: { match: MatchWithId; highlightFighter: string }) {
  const isA = match.FighterAName === highlightFighter;
  const won = (isA && match.WinnerId === "fighterA") || (!isA && match.WinnerId === "fighterB");
  const opponent = isA ? match.FighterBName : match.FighterAName;
  const myPoints = isA ? match.PointsA : match.PointsB;
  const theirPoints = isA ? match.PointsB : match.PointsA;

  const methodLabel = match.WinMethod === "submission" ? "SUB" : match.WinMethod === "points" ? "PTS" : "REF";

  return (
    <div style={{
      background: "#1a1a1a",
      borderRadius: 8,
      padding: "12px 16px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      borderLeft: `4px solid ${won ? "#28a745" : "#dc3545"}`,
    }}>
      <div>
        <span style={{
          fontWeight: 700,
          color: won ? "#28a745" : "#dc3545",
          marginRight: 8,
        }}>
          {won ? "WIN" : "LOSS"}
        </span>
        <span style={{ color: "#888", fontSize: "0.875rem" }}>vs </span>
        <span style={{ fontWeight: 500 }}>{opponent}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontWeight: 600 }}>
          {myPoints} - {theirPoints}
        </span>
        <span style={{
          padding: "2px 6px",
          background: "#333",
          borderRadius: 4,
          fontSize: "0.75rem",
          color: "#888",
        }}>
          {methodLabel}
        </span>
      </div>
    </div>
  );
}

function BracketCard({
  bracket,
  matches,
  onSelectFighter,
  onViewBracket,
  timeEstimates,
}: {
  bracket: BracketWithId;
  matches: MatchWithId[];
  onSelectFighter: (name: string) => void;
  onViewBracket: () => void;
  timeEstimates: Map<string, MatchTimeEstimate>;
}) {
  const activeMatch = matches.find((m) => m.Status === "in_progress");
  const completedCount = matches.filter((m) => m.Status === "finished").length;
  const totalMatches = matches.length;

  // Get next scheduled match time for this bracket
  const nextScheduledMatch = matches.find((m) => m.Status === "scheduled");
  const nextMatchEstimate = nextScheduledMatch ? timeEstimates.get(nextScheduledMatch.id) : null;

  return (
    <div style={{
      background: "#1a1a1a",
      borderRadius: 12,
      padding: 16,
      border: activeMatch ? "2px solid #ffc107" : "2px solid transparent",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 6,
          height: 40,
          background: BELT_COLORS[bracket.belt as Belt] || "#666",
          borderRadius: 3,
        }} />
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>{bracket.name}</h3>
          <div style={{ fontSize: "0.75rem", color: "#888" }}>
            {AGE_GROUP_LABELS[bracket.ageGroup as AgeGroup]} • {bracket.format === "double_elimination" ? "Double Elim" : "Round Robin"}
          </div>
        </div>
        <button
          onClick={onViewBracket}
          style={{
            padding: "6px 12px",
            background: "#0d6efd",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            fontSize: "0.75rem",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          View Bracket
        </button>
      </div>

      {/* Live indicator */}
      {activeMatch && (
        <div style={{
          background: "#ffc10722",
          padding: "8px 12px",
          borderRadius: 6,
          marginBottom: 12,
          fontSize: "0.875rem",
        }}>
          <span style={{ color: "#ffc107", fontWeight: 600 }}>LIVE:</span>{" "}
          {activeMatch.FighterAName} vs {activeMatch.FighterBName}
        </div>
      )}

      {/* Progress */}
      <div style={{ marginBottom: 12 }}>
        <div style={{
          height: 4,
          background: "#333",
          borderRadius: 2,
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${totalMatches > 0 ? (completedCount / totalMatches) * 100 : 0}%`,
            background: "#28a745",
            transition: "width 0.3s",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#888", marginTop: 4 }}>
          <span>{completedCount}/{totalMatches} matches complete</span>
          {nextMatchEstimate && !activeMatch && (
            <span style={{ color: "#0d6efd" }}>
              Next ~{formatEstimatedTime(nextMatchEstimate.estimatedStartTime)}
            </span>
          )}
        </div>
      </div>

      {/* Participants */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {bracket.participants.slice(0, 8).map((p) => (
          <button
            key={p}
            onClick={() => onSelectFighter(p)}
            style={{
              padding: "4px 8px",
              background: "#2a2a2a",
              border: "none",
              borderRadius: 4,
              color: "#ccc",
              fontSize: "0.75rem",
              cursor: "pointer",
            }}
          >
            {p}
          </button>
        ))}
        {bracket.participants.length > 8 && (
          <span style={{ padding: "4px 8px", color: "#666", fontSize: "0.75rem" }}>
            +{bracket.participants.length - 8} more
          </span>
        )}
      </div>
    </div>
  );
}

// Bracket visualization components

function DoubleEliminationBracket({
  matches,
  timeEstimates,
  onSelectFighter,
}: {
  matches: MatchWithId[];
  timeEstimates: Map<string, MatchTimeEstimate>;
  onSelectFighter: (name: string) => void;
}) {
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
        <h3 style={{ margin: "0 0 16px 0", color: "#28a745" }}>Winners Bracket</h3>
        <div style={{ overflowX: "auto", paddingBottom: 8 }}>
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
                      <SpectatorMatchCard
                        key={match.id}
                        match={match}
                        timeEstimate={timeEstimates.get(match.id)}
                        onSelectFighter={onSelectFighter}
                      />
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
          <h3 style={{ margin: "0 0 16px 0", color: "#dc3545" }}>Losers Bracket</h3>
          <div style={{ overflowX: "auto", paddingBottom: 8 }}>
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
                        <SpectatorMatchCard
                          key={match.id}
                          match={match}
                          timeEstimate={timeEstimates.get(match.id)}
                          onSelectFighter={onSelectFighter}
                        />
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
          <h3 style={{ margin: "0 0 16px 0", color: "#ffc107" }}>Grand Final</h3>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
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
                <SpectatorMatchCard
                  match={match}
                  timeEstimate={timeEstimates.get(match.id)}
                  onSelectFighter={onSelectFighter}
                />
              </div>
            ))}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#666", marginTop: 8 }}>
            Winners bracket champion vs Losers bracket champion
          </div>
        </div>
      )}
    </div>
  );
}

function RoundRobinBracket({
  matches,
  participants,
  timeEstimates,
  onSelectFighter,
}: {
  matches: MatchWithId[];
  participants: string[];
  timeEstimates: Map<string, MatchTimeEstimate>;
  onSelectFighter: (name: string) => void;
}) {
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
        <h3 style={{ margin: "0 0 16px 0" }}>Standings</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#1a1a1a", borderRadius: 8, minWidth: 300 }}>
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
                <tr
                  key={name}
                  style={{ borderBottom: "1px solid #333", cursor: "pointer" }}
                  onClick={() => onSelectFighter(name)}
                >
                  <td style={{ padding: 12 }}>{i + 1}</td>
                  <td style={{ padding: 12, fontWeight: 600 }}>{name}</td>
                  <td style={{ padding: 12, textAlign: "center", color: "#28a745" }}>{stats.wins}</td>
                  <td style={{ padding: 12, textAlign: "center", color: "#dc3545" }}>{stats.losses}</td>
                  <td style={{ padding: 12, textAlign: "center", fontWeight: 700 }}>{stats.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: "0.75rem", color: "#666", marginTop: 8 }}>
          Points: Submission = 3pts, Other wins = 2pts
        </div>
      </div>

      {/* Match List */}
      <div>
        <h3 style={{ margin: "0 0 16px 0" }}>Matches</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {matches.map((match) => (
            <SpectatorMatchCard
              key={match.id}
              match={match}
              timeEstimate={timeEstimates.get(match.id)}
              onSelectFighter={onSelectFighter}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SpectatorMatchCard({
  match,
  timeEstimate,
  onSelectFighter,
}: {
  match: MatchWithId;
  timeEstimate?: MatchTimeEstimate;
  onSelectFighter: (name: string) => void;
}) {
  const isFinished = match.Status === "finished";
  const isInProgress = match.Status === "in_progress";
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
      border: isInProgress ? "2px solid #ffc107" : "2px solid transparent",
    }}>
      {/* Fighter A */}
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: isFinished && winnerIsA ? "#28a74533" : "transparent",
          borderLeft: isFinished && winnerIsA ? "4px solid #28a745" : "4px solid transparent",
          cursor: match.FighterAName !== "TBD" ? "pointer" : "default",
        }}
        onClick={() => match.FighterAName !== "TBD" && onSelectFighter(match.FighterAName)}
      >
        <span style={{ fontWeight: isFinished && winnerIsA ? 700 : 400 }}>
          {match.FighterAName}
        </span>
        {isFinished && (
          <span style={{ fontWeight: 600 }}>{match.PointsA}</span>
        )}
        {isInProgress && (
          <span style={{ fontWeight: 700, fontSize: "1.25rem" }}>{match.PointsA}</span>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "#333" }} />

      {/* Fighter B */}
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: isFinished && winnerIsB ? "#28a74533" : "transparent",
          borderLeft: isFinished && winnerIsB ? "4px solid #28a745" : "4px solid transparent",
          cursor: match.FighterBName !== "TBD" ? "pointer" : "default",
        }}
        onClick={() => match.FighterBName !== "TBD" && onSelectFighter(match.FighterBName)}
      >
        <span style={{ fontWeight: isFinished && winnerIsB ? 700 : 400 }}>
          {match.FighterBName}
        </span>
        {isFinished && (
          <span style={{ fontWeight: 600 }}>{match.PointsB}</span>
        )}
        {isInProgress && (
          <span style={{ fontWeight: 700, fontSize: "1.25rem" }}>{match.PointsB}</span>
        )}
      </div>

      {/* Status */}
      {isInProgress && (
        <div style={{
          padding: "6px 12px",
          background: "#ffc10733",
          fontSize: "0.75rem",
          textAlign: "center",
          color: "#ffc107",
          textTransform: "uppercase",
          fontWeight: 600,
        }}>
          LIVE
        </div>
      )}

      {!isFinished && !isInProgress && !isTBD && (
        <div style={{
          padding: "6px 12px",
          background: "#333",
          fontSize: "0.75rem",
          textAlign: "center",
          color: "#888",
          display: "flex",
          justifyContent: "center",
          gap: 8,
        }}>
          <span>Scheduled</span>
          {timeEstimate && (
            <span style={{ color: "#0d6efd" }}>
              ~{formatEstimatedTime(timeEstimate.estimatedStartTime)}
            </span>
          )}
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
