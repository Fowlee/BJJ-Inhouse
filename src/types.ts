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

  // Bracket fields
  bracketId?: string;
  bracketRound?: number;
  bracketPosition?: number;
  bracketSide?: "winners" | "losers" | "grand_final" | "true_final";
  nextMatchId?: string;
  nextMatchSlot?: "A" | "B";
  loserNextMatchId?: string; // For double elim - where loser goes
  loserNextMatchSlot?: "A" | "B";
  matchDuration?: number; // in seconds
  queueOrder?: number; // Manual queue position (lower = earlier)

  // Result fields
  WinnerId?: string;
  WinMethod?: "points" | "submission" | "ref_decision";
};

export type MatchWithId = MatchDoc & { id: string };

// Bracket types
export type BracketFormat = "double_elimination" | "round_robin";
export type BracketStatus = "pending" | "active" | "completed";

// Age groups with IBJJF-style match durations
export type AgeGroup = "4-5" | "6-7" | "8-9" | "10-11" | "12" | "13-15" | "16-17" | "adult";

export const AGE_GROUP_DURATIONS: Record<AgeGroup, number> = {
  "4-5": 3 * 60,     // 3 minutes
  "6-7": 3 * 60,     // 3 minutes
  "8-9": 3 * 60,     // 3 minutes
  "10-11": 4 * 60,   // 4 minutes
  "12": 4 * 60,      // 4 minutes
  "13-15": 5 * 60,   // 5 minutes
  "16-17": 5 * 60,   // 5 minutes
  "adult": 6 * 60,   // 6 minutes
};

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  "4-5": "Pee-Wee (4-5)",
  "6-7": "Kids (6-7)",
  "8-9": "Kids (8-9)",
  "10-11": "Kids (10-11)",
  "12": "Kids (12)",
  "13-15": "Teen (13-15)",
  "16-17": "Juvenile (16-17)",
  "adult": "Adult (18+)",
};

// Age group order for scheduling (youngest first)
export const AGE_GROUP_ORDER: AgeGroup[] = [
  "4-5",
  "6-7",
  "8-9",
  "10-11",
  "12",
  "13-15",
  "16-17",
  "adult",
];

// Weight classes
export type WeightClass =
  | "rooster" | "light_feather" | "feather" | "light"
  | "middle" | "medium_heavy" | "heavy" | "super_heavy" | "ultra_heavy";

export type WeightClassInfo = {
  name: string;
  shortName: string;
  maxKg: number | null; // null for open/unlimited
};

// Weight classes per age group (IBJJF-style)
export const WEIGHT_CLASSES: Record<AgeGroup, Record<WeightClass, WeightClassInfo>> = {
  "4-5": {
    rooster: { name: "Rooster", shortName: "Rooster", maxKg: 16.0 },
    light_feather: { name: "Light Feather", shortName: "L.Feather", maxKg: 18.0 },
    feather: { name: "Feather", shortName: "Feather", maxKg: 20.0 },
    light: { name: "Light", shortName: "Light", maxKg: 22.0 },
    middle: { name: "Middle", shortName: "Middle", maxKg: 24.0 },
    medium_heavy: { name: "Medium Heavy", shortName: "M.Heavy", maxKg: 26.0 },
    heavy: { name: "Heavy", shortName: "Heavy", maxKg: 28.0 },
    super_heavy: { name: "Super Heavy", shortName: "S.Heavy", maxKg: null },
    ultra_heavy: { name: "Ultra Heavy", shortName: "U.Heavy", maxKg: null },
  },
  "6-7": {
    rooster: { name: "Rooster", shortName: "Rooster", maxKg: 19.0 },
    light_feather: { name: "Light Feather", shortName: "L.Feather", maxKg: 22.0 },
    feather: { name: "Feather", shortName: "Feather", maxKg: 25.0 },
    light: { name: "Light", shortName: "Light", maxKg: 28.0 },
    middle: { name: "Middle", shortName: "Middle", maxKg: 31.0 },
    medium_heavy: { name: "Medium Heavy", shortName: "M.Heavy", maxKg: 34.0 },
    heavy: { name: "Heavy", shortName: "Heavy", maxKg: 37.0 },
    super_heavy: { name: "Super Heavy", shortName: "S.Heavy", maxKg: null },
    ultra_heavy: { name: "Ultra Heavy", shortName: "U.Heavy", maxKg: null },
  },
  "8-9": {
    rooster: { name: "Rooster", shortName: "Rooster", maxKg: 22.0 },
    light_feather: { name: "Light Feather", shortName: "L.Feather", maxKg: 26.0 },
    feather: { name: "Feather", shortName: "Feather", maxKg: 30.0 },
    light: { name: "Light", shortName: "Light", maxKg: 34.0 },
    middle: { name: "Middle", shortName: "Middle", maxKg: 38.0 },
    medium_heavy: { name: "Medium Heavy", shortName: "M.Heavy", maxKg: 42.0 },
    heavy: { name: "Heavy", shortName: "Heavy", maxKg: 46.0 },
    super_heavy: { name: "Super Heavy", shortName: "S.Heavy", maxKg: null },
    ultra_heavy: { name: "Ultra Heavy", shortName: "U.Heavy", maxKg: null },
  },
  "10-11": {
    rooster: { name: "Rooster", shortName: "Rooster", maxKg: 26.0 },
    light_feather: { name: "Light Feather", shortName: "L.Feather", maxKg: 30.0 },
    feather: { name: "Feather", shortName: "Feather", maxKg: 34.0 },
    light: { name: "Light", shortName: "Light", maxKg: 38.0 },
    middle: { name: "Middle", shortName: "Middle", maxKg: 42.0 },
    medium_heavy: { name: "Medium Heavy", shortName: "M.Heavy", maxKg: 46.0 },
    heavy: { name: "Heavy", shortName: "Heavy", maxKg: 50.0 },
    super_heavy: { name: "Super Heavy", shortName: "S.Heavy", maxKg: null },
    ultra_heavy: { name: "Ultra Heavy", shortName: "U.Heavy", maxKg: null },
  },
  "12": {
    rooster: { name: "Rooster", shortName: "Rooster", maxKg: 30.0 },
    light_feather: { name: "Light Feather", shortName: "L.Feather", maxKg: 34.0 },
    feather: { name: "Feather", shortName: "Feather", maxKg: 38.0 },
    light: { name: "Light", shortName: "Light", maxKg: 42.0 },
    middle: { name: "Middle", shortName: "Middle", maxKg: 46.0 },
    medium_heavy: { name: "Medium Heavy", shortName: "M.Heavy", maxKg: 50.0 },
    heavy: { name: "Heavy", shortName: "Heavy", maxKg: 54.0 },
    super_heavy: { name: "Super Heavy", shortName: "S.Heavy", maxKg: null },
    ultra_heavy: { name: "Ultra Heavy", shortName: "U.Heavy", maxKg: null },
  },
  "13-15": {
    rooster: { name: "Rooster", shortName: "Rooster", maxKg: 40.0 },
    light_feather: { name: "Light Feather", shortName: "L.Feather", maxKg: 45.0 },
    feather: { name: "Feather", shortName: "Feather", maxKg: 50.0 },
    light: { name: "Light", shortName: "Light", maxKg: 55.0 },
    middle: { name: "Middle", shortName: "Middle", maxKg: 60.0 },
    medium_heavy: { name: "Medium Heavy", shortName: "M.Heavy", maxKg: 66.0 },
    heavy: { name: "Heavy", shortName: "Heavy", maxKg: 72.0 },
    super_heavy: { name: "Super Heavy", shortName: "S.Heavy", maxKg: null },
    ultra_heavy: { name: "Ultra Heavy", shortName: "U.Heavy", maxKg: null },
  },
  "16-17": {
    rooster: { name: "Rooster", shortName: "Rooster", maxKg: 55.5 },
    light_feather: { name: "Light Feather", shortName: "L.Feather", maxKg: 59.0 },
    feather: { name: "Feather", shortName: "Feather", maxKg: 64.0 },
    light: { name: "Light", shortName: "Light", maxKg: 69.0 },
    middle: { name: "Middle", shortName: "Middle", maxKg: 74.0 },
    medium_heavy: { name: "Medium Heavy", shortName: "M.Heavy", maxKg: 79.3 },
    heavy: { name: "Heavy", shortName: "Heavy", maxKg: 84.3 },
    super_heavy: { name: "Super Heavy", shortName: "S.Heavy", maxKg: null },
    ultra_heavy: { name: "Ultra Heavy", shortName: "U.Heavy", maxKg: null },
  },
  adult: {
    rooster: { name: "Rooster", shortName: "Rooster", maxKg: 57.5 },
    light_feather: { name: "Light Feather", shortName: "L.Feather", maxKg: 64.0 },
    feather: { name: "Feather", shortName: "Feather", maxKg: 70.0 },
    light: { name: "Light", shortName: "Light", maxKg: 76.0 },
    middle: { name: "Middle", shortName: "Middle", maxKg: 82.3 },
    medium_heavy: { name: "Medium Heavy", shortName: "M.Heavy", maxKg: 88.3 },
    heavy: { name: "Heavy", shortName: "Heavy", maxKg: 94.3 },
    super_heavy: { name: "Super Heavy", shortName: "S.Heavy", maxKg: 100.5 },
    ultra_heavy: { name: "Ultra Heavy", shortName: "U.Heavy", maxKg: null },
  },
};

// Belt levels
export type KidsBelt = "white" | "grey" | "yellow" | "orange" | "green";
export type AdultBelt = "white" | "blue" | "purple" | "brown" | "black";
export type Belt = KidsBelt | AdultBelt;

export const KIDS_BELTS: KidsBelt[] = ["white", "grey", "yellow", "orange", "green"];
export const ADULT_BELTS: AdultBelt[] = ["white", "blue", "purple", "brown", "black"];

export const BELT_LABELS: Record<Belt, string> = {
  white: "White",
  grey: "Grey",
  yellow: "Yellow",
  orange: "Orange",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
  brown: "Brown",
  black: "Black",
};

export const BELT_COLORS: Record<Belt, string> = {
  white: "#f5f5f5",
  grey: "#9e9e9e",
  yellow: "#ffeb3b",
  orange: "#ff9800",
  green: "#4caf50",
  blue: "#2196f3",
  purple: "#9c27b0",
  brown: "#795548",
  black: "#212121",
};

// Helper to get available belts for age group
export function getBeltsForAgeGroup(ageGroup: AgeGroup): Belt[] {
  if (ageGroup === "adult") {
    return ADULT_BELTS;
  }
  if (ageGroup === "16-17") {
    // Juveniles can be white, blue, or purple
    return ["white", "blue", "purple"];
  }
  // Kids belts
  return KIDS_BELTS;
}

// Helper to get weight class label with kg
export function getWeightClassLabel(ageGroup: AgeGroup, weightClass: WeightClass): string {
  const info = WEIGHT_CLASSES[ageGroup][weightClass];
  if (info.maxKg === null) {
    return `${info.name} (Open)`;
  }
  return `${info.name} (-${info.maxKg}kg)`;
}

export type BracketDoc = {
  name: string;
  format: BracketFormat;
  participants: string[];
  matId: string;
  status: BracketStatus;
  createdAt: Date;
  ageGroup: AgeGroup;
  weightClass: WeightClass;
  belt: Belt;
  matchDuration: number; // in seconds
};

export type BracketWithId = BracketDoc & { id: string };

// Tournament settings
export type TournamentSettings = {
  startTime: string; // ISO string or HH:MM format
  bufferMinutes: number; // Minutes between matches (for fighter transitions)
};

export const DEFAULT_TOURNAMENT_SETTINGS: TournamentSettings = {
  startTime: "09:00",
  bufferMinutes: 2,
};
