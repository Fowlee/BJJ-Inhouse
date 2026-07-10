import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../assets/firebase";
import type { MatchWithId, BracketWithId, AgeGroup } from "../types";
import { AGE_GROUP_ORDER } from "../types";

function getAgeGroupOrder(ageGroup: AgeGroup): number {
  const index = AGE_GROUP_ORDER.indexOf(ageGroup);
  return index >= 0 ? index : 999;
}

export function useMatchForMat(matId: string) {
  const [matches, setMatches] = useState<MatchWithId[]>([]);
  const [brackets, setBrackets] = useState<BracketWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!matId) return;

    setLoading(true);
    setError(null);

    // Fetch matches for this mat
    const matchesQuery = query(
      collection(db, "matches"),
      where("MatId", "==", matId),
      where("Status", "in", ["scheduled", "in_progress"])
    );

    // Fetch all brackets (we need them for age group sorting)
    const bracketsQuery = query(collection(db, "brackets"));

    let matchesData: MatchWithId[] = [];
    let bracketsData: BracketWithId[] = [];
    let matchesLoaded = false;
    let bracketsLoaded = false;

    const updateState = () => {
      if (!matchesLoaded || !bracketsLoaded) return;

      // Create a map of bracketId -> bracket for quick lookup
      const bracketMap = new Map<string, BracketWithId>();
      for (const b of bracketsData) {
        bracketMap.set(b.id, b);
      }

      // Sort matches by bracket age group (youngest first), using queueOrder only when both have it
      const sorted = [...matchesData].sort((a, b) => {
        // Only use queueOrder if BOTH matches have it set (manual full-queue reorder)
        if (a.queueOrder !== undefined && b.queueOrder !== undefined) {
          return a.queueOrder - b.queueOrder;
        }

        // Otherwise, use age-group-based sorting
        const bracketA = a.bracketId ? bracketMap.get(a.bracketId) : null;
        const bracketB = b.bracketId ? bracketMap.get(b.bracketId) : null;

        // Get age group order (standalone matches without brackets go last)
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

      setMatches(sorted);
      setBrackets(bracketsData);
      setLoading(false);
    };

    const unsubMatches = onSnapshot(
      matchesQuery,
      (snap) => {
        matchesData = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as MatchWithId));
        matchesLoaded = true;
        updateState();
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    const unsubBrackets = onSnapshot(
      bracketsQuery,
      (snap) => {
        bracketsData = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as BracketWithId));
        bracketsLoaded = true;
        updateState();
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => {
      unsubMatches();
      unsubBrackets();
    };
  }, [matId]);

  // Find current match (in_progress first, then first scheduled)
  const inProgressMatch = matches.find((m) => m.Status === "in_progress");
  const currentMatch = inProgressMatch || matches.find((m) => m.Status === "scheduled") || null;
  const queue = matches.filter((m) => m !== currentMatch);

  return {
    currentMatch,
    queue,
    brackets,
    loading,
    error
  };
}
