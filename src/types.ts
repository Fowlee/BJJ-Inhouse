export type MatchStatus = "scheduled" | "in_progress" | "finished";

export type MatchDoc = {
  MatId: string;
  Status: MatchStatus;

  FighterAName: string;
  FighterBName: string;

  PointsA: number;
  PointsB: number;
  AdvantagesA: number;
  AdvantagesB: number;
  PenaltiesA: number;
  PenaltiesB: number;

  Round: number;
  PositionInRound: number;

  // optional (later)
  WinnerId?: string;
  WinMethod?: "points" | "submission" | "ref_decision";
};

export type MatchWithId = MatchDoc & { id: string };
