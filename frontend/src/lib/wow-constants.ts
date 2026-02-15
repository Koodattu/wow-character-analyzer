// ─── WoW Constants for Frontend ────────────────────────────────────────

export const WOW_CLASS_COLORS: Record<string, string> = {
  "Death Knight": "#C41E3A",
  "Demon Hunter": "#A330C9",
  Druid: "#FF7C0A",
  Evoker: "#33937F",
  Hunter: "#AAD372",
  Mage: "#3FC7EB",
  Monk: "#00FF98",
  Paladin: "#F48CBA",
  Priest: "#FFFFFF",
  Rogue: "#FFF468",
  Shaman: "#0070DD",
  Warlock: "#8788EE",
  Warrior: "#C69B6D",
};

export function getClassColor(className: string | null | undefined): string {
  if (!className) return "#888888";
  return WOW_CLASS_COLORS[className] ?? "#888888";
}

export interface ParseTier {
  tier: string;
  label: string;
  color: string;
}

export function getParseColor(percentile: number | null | undefined): string {
  if (percentile === null || percentile === undefined) return "#666666";
  if (percentile === 100) return "#e5cc80";
  if (percentile >= 99) return "#e268a8";
  if (percentile >= 95) return "#ff8000";
  if (percentile >= 75) return "#a335ee";
  if (percentile >= 50) return "#0070ff";
  if (percentile >= 25) return "#1eff00";
  return "#666666";
}

export function getParseTier(percentile: number | null | undefined): ParseTier {
  if (percentile === null || percentile === undefined) {
    return { tier: "unknown", label: "No Data", color: "#666666" };
  }
  if (percentile === 100) return { tier: "legendary", label: "Rank 1", color: "#e5cc80" };
  if (percentile >= 99) return { tier: "exceptional", label: "Exceptional", color: "#e268a8" };
  if (percentile >= 95) return { tier: "mythic-tier", label: "Near Perfect", color: "#ff8000" };
  if (percentile >= 90) return { tier: "excellent", label: "Excellent", color: "#ff8000" };
  if (percentile >= 75) return { tier: "great", label: "Very Good", color: "#a335ee" };
  if (percentile >= 50) return { tier: "average", label: "Average", color: "#0070ff" };
  if (percentile >= 25) return { tier: "below-average", label: "Below Average", color: "#1eff00" };
  if (percentile >= 1) return { tier: "poor", label: "Poor", color: "#666666" };
  return { tier: "dead-weight", label: "Dead Weight", color: "#666666" };
}

export const FACTION_COLORS = {
  alliance: "#0078FF",
  horde: "#B30000",
} as const;

export function getFactionColor(faction: string | null | undefined): string {
  if (!faction) return "#888888";
  return FACTION_COLORS[faction.toLowerCase() as keyof typeof FACTION_COLORS] ?? "#888888";
}
