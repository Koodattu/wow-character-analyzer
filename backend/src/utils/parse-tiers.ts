// ─── Parse Tier System ─────────────────────────────────────────────────
// WCL-standard color scale for parse percentiles

export interface ParseTier {
  tier: string;
  label: string;
  color: string;
  cssClass: string;
}

export function getParseColor(percentile: number | null | undefined): string {
  if (percentile === null || percentile === undefined) return "#666666";
  if (percentile === 100) return "#e5cc80"; // Gold
  if (percentile >= 99) return "#e268a8"; // Pink
  if (percentile >= 95) return "#ff8000"; // Orange
  if (percentile >= 75) return "#a335ee"; // Purple
  if (percentile >= 50) return "#0070ff"; // Blue
  if (percentile >= 25) return "#1eff00"; // Green
  return "#666666"; // Gray
}

export function getParseTier(percentile: number | null | undefined): ParseTier {
  if (percentile === null || percentile === undefined) {
    return {
      tier: "unknown",
      label: "No Data",
      color: "#666666",
      cssClass: "parse-unknown",
    };
  }

  if (percentile === 100) {
    return {
      tier: "legendary",
      label: "Rank 1 — Cheese/Exploit likely",
      color: "#e5cc80",
      cssClass: "parse-legendary",
    };
  }

  if (percentile >= 99) {
    return {
      tier: "exceptional",
      label: "Achievable Rank 1",
      color: "#e268a8",
      cssClass: "parse-exceptional",
    };
  }

  if (percentile >= 95) {
    return {
      tier: "mythic-tier",
      label: "Near Perfect Play",
      color: "#ff8000",
      cssClass: "parse-mythic",
    };
  }

  if (percentile >= 90) {
    return {
      tier: "excellent",
      label: "Excellent",
      color: "#ff8000",
      cssClass: "parse-excellent",
    };
  }

  if (percentile >= 75) {
    return {
      tier: "great",
      label: "Very Good — Room for Improvement",
      color: "#a335ee",
      cssClass: "parse-great",
    };
  }

  if (percentile >= 50) {
    return {
      tier: "average",
      label: "Average — Rotational/CD Mistakes",
      color: "#0070ff",
      cssClass: "parse-average",
    };
  }

  if (percentile >= 25) {
    return {
      tier: "below-average",
      label: "Below Average — Significant Issues",
      color: "#1eff00",
      cssClass: "parse-below-average",
    };
  }

  if (percentile >= 1) {
    return {
      tier: "poor",
      label: "Poor — Major Problems",
      color: "#666666",
      cssClass: "parse-poor",
    };
  }

  return {
    tier: "dead-weight",
    label: "Dead All Fight / AFK",
    color: "#666666",
    cssClass: "parse-dead",
  };
}

// WoW class colors (standard)
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
