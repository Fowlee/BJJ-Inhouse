import type { MatchWithId, BracketWithId, TournamentSettings, AgeGroup } from "../types";
import { AGE_GROUP_ORDER } from "../types";

export type MatchTimeEstimate = {
  matchId: string;
  estimatedStartTime: Date;
  queuePosition: number; // Position in mat queue (1 = next up)
};

/**
 * Get the sort order for an age group (lower = earlier)
 */
function getAgeGroupOrder(ageGroup: AgeGroup): number {
  const index = AGE_GROUP_ORDER.indexOf(ageGroup);
  return index >= 0 ? index : 999;
}

/**
 * Calculate estimated start times for all scheduled matches on a given mat.
 * Orders brackets by age group (youngest first), then matches within each bracket.
 */
export function calculateMatTimeEstimates(
  matches: MatchWithId[],
  brackets: BracketWithId[],
  matId: string,
  settings: TournamentSettings
): Map<string, MatchTimeEstimate> {
  const estimates = new Map<string, MatchTimeEstimate>();

  // Parse start time
  const [hours, minutes] = settings.startTime.split(":").map(Number);
  const today = new Date();
  const tournamentStart = new Date(today);
  tournamentStart.setHours(hours, minutes, 0, 0);

  // Get brackets for this mat, sorted by age group (youngest first)
  const matBrackets = brackets
    .filter((b) => b.matId === matId)
    .sort((a, b) => getAgeGroupOrder(a.ageGroup) - getAgeGroupOrder(b.ageGroup));

  // Get all matches for this mat
  const matMatches = matches.filter((m) => m.MatId === matId);

  // Check if ALL matches have manual queue order (full reorder was done)
  const allHaveQueueOrder = matMatches.length > 0 && matMatches.every((m) => m.queueOrder !== undefined);

  let orderedMatches: MatchWithId[];

  if (allHaveQueueOrder) {
    // Sort by manual queueOrder when all matches have it
    orderedMatches = [...matMatches].sort((a, b) => a.queueOrder! - b.queueOrder!);
  } else {
    // Build ordered list by bracket age group (youngest first)
    orderedMatches = [];

    for (const bracket of matBrackets) {
      // Get matches for this bracket, sorted by round and position
      const bracketMatches = matMatches
        .filter((m) => m.bracketId === bracket.id)
        .sort((a, b) => {
          // For double elim: winners bracket first, then losers, then finals
          const sideOrder = { winners: 0, losers: 1, grand_final: 2, true_final: 3 };
          const sideA = sideOrder[a.bracketSide || "winners"] ?? 0;
          const sideB = sideOrder[b.bracketSide || "winners"] ?? 0;
          if (sideA !== sideB) return sideA - sideB;

          // Then by round
          const roundA = a.bracketRound ?? a.Round;
          const roundB = b.bracketRound ?? b.Round;
          if (roundA !== roundB) return roundA - roundB;

          // Then by position
          return (a.bracketPosition ?? a.PositionInRound) - (b.bracketPosition ?? b.PositionInRound);
        });

      orderedMatches.push(...bracketMatches);
    }

    // Also add any standalone matches (no bracketId) at the end
    const standaloneMatches = matMatches
      .filter((m) => !m.bracketId)
      .sort((a, b) => a.Round - b.Round || a.PositionInRound - b.PositionInRound);
    orderedMatches.push(...standaloneMatches);
  }

  // Calculate times
  let currentTime = new Date(tournamentStart);
  let queuePosition = 1;

  // First, account for finished matches
  for (const match of orderedMatches) {
    if (match.Status === "finished") {
      const duration = match.matchDuration || 300;
      currentTime = new Date(currentTime.getTime() + (duration + settings.bufferMinutes * 60) * 1000);
    }
  }

  // If there's a match in progress, use current time as base
  const inProgressMatch = orderedMatches.find((m) => m.Status === "in_progress");
  if (inProgressMatch) {
    const remainingSeconds = (inProgressMatch.matchDuration || 300) / 2;
    currentTime = new Date(Date.now() + (remainingSeconds + settings.bufferMinutes * 60) * 1000);
  }

  // Calculate estimates for scheduled matches
  for (const match of orderedMatches) {
    if (match.Status === "finished") continue;

    if (match.Status === "in_progress") {
      estimates.set(match.id, {
        matchId: match.id,
        estimatedStartTime: new Date(),
        queuePosition: 0,
      });
      continue;
    }

    // Scheduled match
    estimates.set(match.id, {
      matchId: match.id,
      estimatedStartTime: new Date(currentTime),
      queuePosition,
    });

    const duration = match.matchDuration || 300;
    currentTime = new Date(currentTime.getTime() + (duration + settings.bufferMinutes * 60) * 1000);
    queuePosition++;
  }

  return estimates;
}

/**
 * Calculate estimates for all mats
 */
export function calculateAllTimeEstimates(
  matches: MatchWithId[],
  brackets: BracketWithId[],
  settings: TournamentSettings
): Map<string, MatchTimeEstimate> {
  const allEstimates = new Map<string, MatchTimeEstimate>();

  // Get unique mat IDs
  const matIds = new Set(matches.map((m) => m.MatId));

  for (const matId of matIds) {
    const matEstimates = calculateMatTimeEstimates(matches, brackets, matId, settings);
    matEstimates.forEach((estimate, matchId) => {
      allEstimates.set(matchId, estimate);
    });
  }

  return allEstimates;
}

/**
 * Format time as "~2:15 PM"
 */
export function formatEstimatedTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Calculate total estimated tournament duration for a mat
 */
export function calculateMatTotalDuration(
  matches: MatchWithId[],
  matId: string,
  settings: TournamentSettings
): { totalMinutes: number; matchCount: number } {
  const matMatches = matches.filter((m) => m.MatId === matId && m.Status !== "finished");

  let totalSeconds = 0;
  for (const match of matMatches) {
    totalSeconds += (match.matchDuration || 300) + settings.bufferMinutes * 60;
  }

  return {
    totalMinutes: Math.ceil(totalSeconds / 60),
    matchCount: matMatches.length,
  };
}
