// ─── AI Summary Generation ─────────────────────────────────────────────
import { eq } from "drizzle-orm";
import { db } from "../db";
import { characters, characterProfiles, characterBossStats, characterAiSummary, raiderioScores } from "../db/schema";
import { getParseTier } from "../utils/parse-tiers";
import { log as rootLog } from "../lib/logger";

const log = rootLog.child({ module: "ai" });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

interface AiSummaryResult {
  verdict: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  pitfalls: string[];
}

function buildPrompt(charName: string, className: string | null, specName: string | null, profile: any, bossStats: any[], mplusScores: any[]): string {
  const lines: string[] = [];

  lines.push("You are an expert World of Warcraft raid and M+ analyst.");
  lines.push("Analyze the following character's PvE performance data and provide a structured assessment.");
  lines.push("");
  lines.push("## Parse Tier System (WarcraftLogs percentile scale)");
  lines.push("- 100: Legendary (Rank 1 — likely cheese/exploit)");
  lines.push("- 99: Exceptional (Achievable Rank 1)");
  lines.push("- 95-98: Near Perfect Play");
  lines.push("- 90-94: Excellent");
  lines.push("- 75-89: Very Good — Room for Improvement");
  lines.push("- 50-74: Average — Rotational/CD Mistakes likely");
  lines.push("- 25-49: Below Average — Significant Issues");
  lines.push("- 1-24: Poor — Major Problems");
  lines.push("- 0: Dead All Fight / AFK");
  lines.push("");
  lines.push("## What death patterns mean");
  lines.push("- Dying first frequently (high first-death rate) = likely standing in avoidable mechanics, poor positioning");
  lines.push("- Dying early in fights = awareness/positioning issues, not handling early mechanics");
  lines.push("- Many deaths per kill = consistently failing at some mechanic");
  lines.push("");
  lines.push("## What defensive/consumable usage means");
  lines.push("- Low defensive usage rate = forgetting to use survival CDs, possibly not keybinding them");
  lines.push("- Low healthstone usage = not using free survival tools available");
  lines.push("- Low health potion usage = not prepared or forgetting under pressure");
  lines.push("");

  lines.push(`## Character: ${charName}`);
  lines.push(`Class: ${className ?? "Unknown"}, Spec: ${specName ?? "Unknown"}`);
  lines.push("");

  if (profile) {
    lines.push("## Overall Raid Stats");
    lines.push(`- Total Kills: ${profile.totalKills ?? 0}`);
    lines.push(`- Total Wipes: ${profile.totalWipes ?? 0}`);
    lines.push(`- Average Parse: ${profile.avgParse?.toFixed(1) ?? "N/A"}`);
    lines.push(`- Median Parse: ${profile.medianParse?.toFixed(1) ?? "N/A"}`);
    lines.push(`- Best Parse: ${profile.bestParse?.toFixed(1) ?? "N/A"}`);
    lines.push(`- Parse Tier: ${getParseTier(profile.medianParse).label}`);
    lines.push(`- Total Deaths in Kills: ${profile.totalDeaths ?? 0}`);
    lines.push(`- Avg Deaths per Kill: ${profile.avgDeathsPerKill?.toFixed(2) ?? "N/A"}`);
    lines.push(`- First Death Rate: ${profile.firstDeathRate?.toFixed(1) ?? "N/A"}%`);
    lines.push(`- Defensive Usage Rate: ${profile.defensiveUsageRate?.toFixed(1) ?? "N/A"}%`);
    lines.push(`- Healthstone Usage Rate: ${profile.healthstoneUsageRate?.toFixed(1) ?? "N/A"}%`);
    lines.push(`- Health Potion Usage Rate: ${profile.healthPotionUsageRate?.toFixed(1) ?? "N/A"}%`);
    lines.push("");
  }

  if (bossStats.length > 0) {
    lines.push("## Per-Boss Breakdown");
    for (const bs of bossStats) {
      lines.push(`### ${bs.bossName}`);
      lines.push(
        `- Kills: ${bs.kills}, Best Parse: ${bs.bestParse?.toFixed(1) ?? "N/A"}, Median: ${bs.medianParse?.toFixed(1) ?? "N/A"}, Avg: ${bs.avgParse?.toFixed(1) ?? "N/A"}`,
      );
      if (bs.totalDeaths > 0) {
        lines.push(`- Deaths: ${bs.totalDeaths}, First Death Rate: ${bs.firstDeathRate?.toFixed(1) ?? "N/A"}%`);
      }
    }
    lines.push("");
  }

  if (mplusScores.length > 0) {
    lines.push("## Mythic+ Performance");
    for (const score of mplusScores) {
      lines.push(`- Season ${score.seasonSlug}: Overall ${score.overallScore}`);
    }
    if (profile) {
      lines.push(`- Total Runs: ${profile.totalRuns ?? 0}`);
      lines.push(`- Timed Rate: ${profile.timedRate?.toFixed(1) ?? "N/A"}%`);
    }
    lines.push("");
  }

  lines.push("## Instructions");
  lines.push("Respond ONLY with valid JSON in this exact format:");
  lines.push(
    '{ "verdict": "1-2 sentence overall assessment", "summary": "paragraph performance summary", "strengths": ["strength 1", "strength 2"], "improvements": ["area 1", "area 2"], "pitfalls": ["pitfall 1 with data citation", "pitfall 2"] }',
  );

  return lines.join("\n");
}

export async function generateAiSummary(characterId: string): Promise<void> {
  if (!OPENAI_API_KEY) {
    log.info("No OpenAI API key configured, skipping summary generation");
    return;
  }

  log.debug({ characterId }, "Generating AI summary");

  // Fetch character data
  const [char] = await db.select().from(characters).where(eq(characters.id, characterId)).limit(1);

  if (!char) return;

  const [profile, bossStatsData, scoresData] = await Promise.all([
    db
      .select()
      .from(characterProfiles)
      .where(eq(characterProfiles.characterId, characterId))
      .then((r) => r[0] ?? null),
    db.select().from(characterBossStats).where(eq(characterBossStats.characterId, characterId)),
    db.select().from(raiderioScores).where(eq(raiderioScores.characterId, characterId)),
  ]);

  const prompt = buildPrompt(char.name, char.className, char.specName, profile, bossStatsData, scoresData);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content: "You are a World of Warcraft PvE performance analyst. Always respond with valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      log.error({ status: response.status }, "OpenAI API error");
      return;
    }

    const data = await response.json();
    const rawResponse = data.choices?.[0]?.message?.content ?? "";

    // Parse the JSON response
    let parsed: AiSummaryResult;
    try {
      // Try to extract JSON from the response (handle markdown code blocks)
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] ?? rawResponse);
    } catch {
      log.error("Failed to parse AI response as JSON");
      parsed = {
        verdict: rawResponse.slice(0, 200),
        summary: rawResponse,
        strengths: [],
        improvements: [],
        pitfalls: [],
      };
    }

    // Upsert AI summary
    const [existing] = await db.select().from(characterAiSummary).where(eq(characterAiSummary.characterId, characterId)).limit(1);

    const summaryData = {
      characterId,
      verdict: parsed.verdict,
      summary: parsed.summary,
      strengths: parsed.strengths,
      improvements: parsed.improvements,
      pitfalls: parsed.pitfalls,
      modelUsed: OPENAI_MODEL,
      rawResponse,
      generatedAt: new Date(),
    };

    if (existing) {
      await db.update(characterAiSummary).set(summaryData).where(eq(characterAiSummary.characterId, characterId));
    } else {
      await db.insert(characterAiSummary).values(summaryData);
    }

    log.info({ characterName: char.name }, "AI summary generated");
  } catch (error) {
    log.error({ err: error, characterId }, "Failed to generate AI summary");
  }
}
