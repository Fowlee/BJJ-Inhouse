import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../assets/firebase";
import type { MatchWithId } from "../types";

export function useMatchForMat(matId: string) {
  const [matches, setMatches] = useState<MatchWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!matId) return;

    setLoading(true);
    setError(null);

    // 👉 THIS IS THE QUERY
    const q = query(
      collection(db, "matches"),
      where("MatId", "==", matId),
      where("Status", "in", ["scheduled", "in_progress"])
    );

    // 👉 THIS IS WHERE IT RUNS
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as MatchWithId));

        // sort locally (recommended)
        rows.sort((a, b) => {
          const r = (a.Round ?? 0) - (b.Round ?? 0);
          if (r !== 0) return r;
          return (a.PositionInRound ?? 0) - (b.PositionInRound ?? 0);
        });

        setMatches(rows);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [matId]);

  const currentMatch = matches[0] ?? null;
  const queue = matches.slice(1);

  return {
    currentMatch,
    queue,
    loading,
    error
  };
}
