import { collection, addDoc, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../assets/firebase";
import type { MatchDoc, MatchWithId, BracketFormat } from "../types";

type MatchToCreate = Omit<MatchDoc, "Status" | "PointsA" | "PointsB" | "AdvantagesA" | "AdvantagesB" | "PenaltiesA" | "PenaltiesB">;

// Generate matches for a double elimination bracket
export async function generateDoubleEliminationMatches(
  participants: string[],
  bracketId: string,
  matId: string,
  matchDuration: number
): Promise<string[]> {
  const n = participants.length;

  // Pad to nearest power of 2
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
  const paddedParticipants = [...participants];
  while (paddedParticipants.length < bracketSize) {
    paddedParticipants.push("BYE");
  }

  // Shuffle for seeding (simple random shuffle)
  for (let i = paddedParticipants.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [paddedParticipants[i], paddedParticipants[j]] = [paddedParticipants[j], paddedParticipants[i]];
  }

  const winnersRounds = Math.log2(bracketSize);
  const matchIds: string[] = [];

  // Track match IDs by bracket side, round, and position
  const winnersMatchIds: Map<string, string> = new Map();
  const losersMatchIds: Map<string, string> = new Map();

  let globalPosition = 1; // For ordering matches across the tournament

  // ============ WINNERS BRACKET ============
  for (let round = 1; round <= winnersRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round);

    for (let position = 1; position <= matchesInRound; position++) {
      const isFirstRound = round === 1;
      const fighterAIndex = (position - 1) * 2;
      const fighterBIndex = fighterAIndex + 1;

      const matchData: MatchToCreate = {
        MatId: matId,
        FighterAName: isFirstRound ? paddedParticipants[fighterAIndex] : "TBD",
        FighterBName: isFirstRound ? paddedParticipants[fighterBIndex] : "TBD",
        Round: globalPosition,
        PositionInRound: position,
        bracketId,
        bracketRound: round,
        bracketPosition: position,
        bracketSide: "winners",
        matchDuration,
      };

      const docRef = await addDoc(collection(db, "matches"), {
        ...matchData,
        Status: "scheduled",
        PointsA: 0,
        PointsB: 0,
        AdvantagesA: 0,
        AdvantagesB: 0,
        PenaltiesA: 0,
        PenaltiesB: 0,
      });

      matchIds.push(docRef.id);
      winnersMatchIds.set(`${round}-${position}`, docRef.id);
      globalPosition++;
    }
  }

  // ============ LOSERS BRACKET ============
  // Losers bracket structure:
  // - Losers from winners round 1 form losers round 1
  // - Then alternating: matches from previous losers round + drops from winners bracket

  // Calculate losers bracket rounds: (winnersRounds - 1) * 2
  // For 8 participants (3 winners rounds): 4 losers rounds
  // For 4 participants (2 winners rounds): 2 losers rounds
  const losersRounds = (winnersRounds - 1) * 2;

  for (let losersRound = 1; losersRound <= losersRounds; losersRound++) {
    // Determine how many matches in this losers round
    // Odd rounds: receive losers from winners + play against each other
    // Even rounds: survivors from previous round + new drops from winners

    let matchesInRound: number;
    if (losersRound === 1) {
      // First losers round: half of the losers from winners round 1
      matchesInRound = bracketSize / 4;
    } else if (losersRound % 2 === 0) {
      // Even rounds: survivors face new drops from winners
      matchesInRound = Math.max(1, bracketSize / Math.pow(2, Math.floor(losersRound / 2) + 2));
    } else {
      // Odd rounds (after first): survivors play each other
      matchesInRound = Math.max(1, bracketSize / Math.pow(2, Math.floor(losersRound / 2) + 2));
    }

    // Ensure at least 1 match
    matchesInRound = Math.max(1, matchesInRound);

    for (let position = 1; position <= matchesInRound; position++) {
      const matchData: MatchToCreate = {
        MatId: matId,
        FighterAName: "TBD",
        FighterBName: "TBD",
        Round: globalPosition,
        PositionInRound: position,
        bracketId,
        bracketRound: losersRound,
        bracketPosition: position,
        bracketSide: "losers",
        matchDuration,
      };

      const docRef = await addDoc(collection(db, "matches"), {
        ...matchData,
        Status: "scheduled",
        PointsA: 0,
        PointsB: 0,
        AdvantagesA: 0,
        AdvantagesB: 0,
        PenaltiesA: 0,
        PenaltiesB: 0,
      });

      matchIds.push(docRef.id);
      losersMatchIds.set(`${losersRound}-${position}`, docRef.id);
      globalPosition++;
    }
  }

  // ============ GRAND FINAL ============
  const grandFinalData: MatchToCreate = {
    MatId: matId,
    FighterAName: "TBD", // Winners bracket champion
    FighterBName: "TBD", // Losers bracket champion
    Round: globalPosition,
    PositionInRound: 1,
    bracketId,
    bracketRound: 1,
    bracketPosition: 1,
    bracketSide: "grand_final",
    matchDuration,
  };

  const grandFinalRef = await addDoc(collection(db, "matches"), {
    ...grandFinalData,
    Status: "scheduled",
    PointsA: 0,
    PointsB: 0,
    AdvantagesA: 0,
    AdvantagesB: 0,
    PenaltiesA: 0,
    PenaltiesB: 0,
  });
  matchIds.push(grandFinalRef.id);
  globalPosition++;

  // ============ TRUE FINAL (if needed - created when grand final finishes) ============
  // We'll create this dynamically if the losers bracket winner wins grand final

  // ============ LINK WINNERS BRACKET MATCHES ============
  for (let round = 1; round < winnersRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round);

    for (let position = 1; position <= matchesInRound; position++) {
      const currentMatchId = winnersMatchIds.get(`${round}-${position}`);
      const nextRound = round + 1;
      const nextPosition = Math.ceil(position / 2);
      const nextMatchId = winnersMatchIds.get(`${nextRound}-${nextPosition}`);
      const nextMatchSlot: "A" | "B" = position % 2 === 1 ? "A" : "B";

      // Calculate where loser goes in losers bracket
      let loserNextMatchId: string | undefined;
      let loserNextMatchSlot: "A" | "B" | undefined;

      if (round === 1) {
        // Losers from winners round 1 go to losers round 1
        const loserPosition = Math.ceil(position / 2);
        const loserSlot: "A" | "B" = position % 2 === 1 ? "A" : "B";
        loserNextMatchId = losersMatchIds.get(`1-${loserPosition}`);
        loserNextMatchSlot = loserSlot;
      } else {
        // Losers from later winners rounds go to even losers rounds
        const losersRoundForDrop = (round - 1) * 2;
        loserNextMatchId = losersMatchIds.get(`${losersRoundForDrop}-${position}`);
        loserNextMatchSlot = "B"; // Drops always go to slot B
      }

      if (currentMatchId) {
        const updateData: Record<string, unknown> = {};
        if (nextMatchId) {
          updateData.nextMatchId = nextMatchId;
          updateData.nextMatchSlot = nextMatchSlot;
        }
        if (loserNextMatchId) {
          updateData.loserNextMatchId = loserNextMatchId;
          updateData.loserNextMatchSlot = loserNextMatchSlot;
        }
        if (Object.keys(updateData).length > 0) {
          await updateDoc(doc(db, "matches", currentMatchId), updateData);
        }
      }
    }
  }

  // Link winners final to grand final
  const winnersFinalId = winnersMatchIds.get(`${winnersRounds}-1`);
  if (winnersFinalId) {
    await updateDoc(doc(db, "matches", winnersFinalId), {
      nextMatchId: grandFinalRef.id,
      nextMatchSlot: "A",
      // Loser of winners final goes to last losers round
      loserNextMatchId: losersMatchIds.get(`${losersRounds}-1`),
      loserNextMatchSlot: "B",
    });
  }

  // ============ LINK LOSERS BRACKET MATCHES ============
  for (let losersRound = 1; losersRound < losersRounds; losersRound++) {
    const currentRoundMatches = Array.from(losersMatchIds.entries())
      .filter(([key]) => key.startsWith(`${losersRound}-`));

    for (const [key, currentMatchId] of currentRoundMatches) {
      const position = parseInt(key.split("-")[1]);
      const nextRound = losersRound + 1;

      // In losers bracket, winners advance to next losers round
      let nextPosition: number;
      let nextSlot: "A" | "B";

      if (losersRound % 2 === 1) {
        // Odd rounds: winners go to slot A of next round (even round)
        nextPosition = position;
        nextSlot = "A";
      } else {
        // Even rounds: winners go to next odd round, positions halve
        nextPosition = Math.ceil(position / 2);
        nextSlot = position % 2 === 1 ? "A" : "B";
      }

      const nextMatchId = losersMatchIds.get(`${nextRound}-${nextPosition}`);

      if (nextMatchId) {
        await updateDoc(doc(db, "matches", currentMatchId), {
          nextMatchId,
          nextMatchSlot: nextSlot,
        });
      }
    }
  }

  // Link losers final to grand final
  const losersFinalId = losersMatchIds.get(`${losersRounds}-1`);
  if (losersFinalId) {
    await updateDoc(doc(db, "matches", losersFinalId), {
      nextMatchId: grandFinalRef.id,
      nextMatchSlot: "B",
    });
  }

  // ============ HANDLE BYES ============
  for (let position = 1; position <= bracketSize / 2; position++) {
    const matchId = winnersMatchIds.get(`1-${position}`);
    if (matchId) {
      const matchRef = doc(db, "matches", matchId);
      const matchSnap = await getDoc(matchRef);
      const matchData = matchSnap.data() as MatchDoc;

      if (matchData.FighterAName === "BYE" || matchData.FighterBName === "BYE") {
        const winner = matchData.FighterAName === "BYE" ? matchData.FighterBName : matchData.FighterAName;
        const winnerId = matchData.FighterAName === "BYE" ? "fighterB" : "fighterA";

        // Mark match as finished
        await updateDoc(matchRef, {
          Status: "finished",
          WinnerId: winnerId,
          WinMethod: "ref_decision",
        });

        // Advance winner to next winners match
        if (matchData.nextMatchId && matchData.nextMatchSlot) {
          const nextField = matchData.nextMatchSlot === "A" ? "FighterAName" : "FighterBName";
          await updateDoc(doc(db, "matches", matchData.nextMatchId), {
            [nextField]: winner,
          });
        }

        // BYE means no real loser - mark losers match spot as BYE too
        if (matchData.loserNextMatchId && matchData.loserNextMatchSlot) {
          const loserField = matchData.loserNextMatchSlot === "A" ? "FighterAName" : "FighterBName";
          await updateDoc(doc(db, "matches", matchData.loserNextMatchId), {
            [loserField]: "BYE",
          });
        }
      }
    }
  }

  // Handle BYEs in losers bracket round 1 (from winners round 1 BYEs)
  const losersRound1Matches = Array.from(losersMatchIds.entries())
    .filter(([key]) => key.startsWith("1-"));

  for (const [, matchId] of losersRound1Matches) {
    const matchRef = doc(db, "matches", matchId);
    const matchSnap = await getDoc(matchRef);
    const matchData = matchSnap.data() as MatchDoc;

    if (matchData.FighterAName === "BYE" && matchData.FighterBName === "BYE") {
      // Both BYEs - mark as finished, no winner advances
      await updateDoc(matchRef, {
        Status: "finished",
        WinnerId: "fighterA", // Arbitrary
        WinMethod: "ref_decision",
      });
      // Advance BYE to next losers match
      if (matchData.nextMatchId && matchData.nextMatchSlot) {
        const nextField = matchData.nextMatchSlot === "A" ? "FighterAName" : "FighterBName";
        await updateDoc(doc(db, "matches", matchData.nextMatchId), {
          [nextField]: "BYE",
        });
      }
    } else if (matchData.FighterAName === "BYE" || matchData.FighterBName === "BYE") {
      const winner = matchData.FighterAName === "BYE" ? matchData.FighterBName : matchData.FighterAName;
      const winnerId = matchData.FighterAName === "BYE" ? "fighterB" : "fighterA";

      await updateDoc(matchRef, {
        Status: "finished",
        WinnerId: winnerId,
        WinMethod: "ref_decision",
      });

      if (matchData.nextMatchId && matchData.nextMatchSlot) {
        const nextField = matchData.nextMatchSlot === "A" ? "FighterAName" : "FighterBName";
        await updateDoc(doc(db, "matches", matchData.nextMatchId), {
          [nextField]: winner,
        });
      }
    }
  }

  return matchIds;
}

// Generate matches for a round robin bracket
// Uses circle method scheduling to ensure no fighter has back-to-back matches
export async function generateRoundRobinMatches(
  participants: string[],
  bracketId: string,
  matId: string,
  matchDuration: number
): Promise<string[]> {
  const matchIds: string[] = [];
  const n = participants.length;

  // Special case: 2 fighters = best of 3 (back-to-back is unavoidable)
  if (n === 2) {
    for (let rep = 1; rep <= 3; rep++) {
      const matchData: MatchToCreate = {
        MatId: matId,
        FighterAName: participants[0],
        FighterBName: participants[1],
        Round: rep,
        PositionInRound: rep,
        bracketId,
        bracketRound: rep,
        bracketPosition: rep,
        matchDuration,
      };

      const docRef = await addDoc(collection(db, "matches"), {
        ...matchData,
        Status: "scheduled",
        PointsA: 0,
        PointsB: 0,
        AdvantagesA: 0,
        AdvantagesB: 0,
        PenaltiesA: 0,
        PenaltiesB: 0,
      });

      matchIds.push(docRef.id);
    }
    return matchIds;
  }

  // For 3+ fighters, use circle method to avoid back-to-back matches
  // Generate all pairings first
  const allPairings: Array<[string, string]> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      allPairings.push([participants[i], participants[j]]);
    }
  }

  // Reorder pairings so no fighter appears in consecutive matches
  const orderedMatches = scheduleWithoutConsecutive(allPairings);

  // Create matches in the optimized order
  let position = 1;
  for (const [fighterA, fighterB] of orderedMatches) {
    const matchData: MatchToCreate = {
      MatId: matId,
      FighterAName: fighterA,
      FighterBName: fighterB,
      Round: 1,
      PositionInRound: position,
      bracketId,
      bracketRound: 1,
      bracketPosition: position,
      matchDuration,
    };

    const docRef = await addDoc(collection(db, "matches"), {
      ...matchData,
      Status: "scheduled",
      PointsA: 0,
      PointsB: 0,
      AdvantagesA: 0,
      AdvantagesB: 0,
      PenaltiesA: 0,
      PenaltiesB: 0,
    });

    matchIds.push(docRef.id);
    position++;
  }

  return matchIds;
}

// Schedule matches so no fighter appears in consecutive matches
function scheduleWithoutConsecutive(pairings: Array<[string, string]>): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  const remaining = [...pairings];

  while (remaining.length > 0) {
    // Find a match where neither fighter was in the previous match
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

    // Fallback: just take the first remaining match
    if (bestIndex === -1) {
      bestIndex = 0;
    }

    result.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }

  return result;
}

// Advance winner to next match (called when a match finishes)
export async function advanceWinner(match: MatchWithId): Promise<void> {
  const winnerName = match.WinnerId === "fighterA" ? match.FighterAName : match.FighterBName;
  const loserName = match.WinnerId === "fighterA" ? match.FighterBName : match.FighterAName;

  // Advance winner
  if (match.nextMatchId && match.nextMatchSlot) {
    const nextField = match.nextMatchSlot === "A" ? "FighterAName" : "FighterBName";
    await updateDoc(doc(db, "matches", match.nextMatchId), {
      [nextField]: winnerName,
    });
  }

  // For double elimination: advance loser to losers bracket
  if (match.loserNextMatchId && match.loserNextMatchSlot && loserName !== "BYE") {
    const loserField = match.loserNextMatchSlot === "A" ? "FighterAName" : "FighterBName";
    await updateDoc(doc(db, "matches", match.loserNextMatchId), {
      [loserField]: loserName,
    });
  }

  // Check if this is grand final and losers bracket winner won
  // If so, create a true final match
  if (match.bracketSide === "grand_final") {
    // If fighter B (losers bracket champion) won, we need a true final
    // For now, we'll handle this in the UI - the bracket is reset
  }
}

// Helper to generate bracket matches based on format
export async function generateBracketMatches(
  format: BracketFormat,
  participants: string[],
  bracketId: string,
  matId: string,
  matchDuration: number
): Promise<string[]> {
  if (format === "double_elimination") {
    return generateDoubleEliminationMatches(participants, bracketId, matId, matchDuration);
  } else {
    return generateRoundRobinMatches(participants, bracketId, matId, matchDuration);
  }
}
