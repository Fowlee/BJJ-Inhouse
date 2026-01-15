export type MatchStatus = "scheduled" | "in_progress" | "finished";

export type MatchDoc = {
  matId: string;
  status: MatchStatus;

  fighterAName: string;
  fighterBName: string;

  pointsA: number;
  pointsB: number;
  advantagesA: number;
  advantagesB: number;
  penaltiesA: number;
  penaltiesB: number;

  round: number;
  positionInRound: number;

  // optional (later)
  winnerId?: string;
  winMethod?: "points" | "submission" | "ref_decision";
};

export type MatchWithId = MatchDoc & { id: string };
