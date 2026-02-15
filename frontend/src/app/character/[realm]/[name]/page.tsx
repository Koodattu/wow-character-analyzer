"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { api } from "@/lib/api";
import { getClassColor, getParseColor, getParseTier, getFactionColor } from "@/lib/wow-constants";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Shield, Skull, Swords, Trophy, Brain, Activity, Timer, TrendingUp, TrendingDown, AlertTriangle, ChevronRight, Loader2 } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────

interface Character {
  id: string;
  name: string;
  realm: string;
  realmSlug: string;
  region: string;
  className: string | null;
  specName: string | null;
  race: string | null;
  faction: string | null;
  guild: string | null;
  profilePicUrl: string | null;
  blizzardId: string | null;
  lastFetchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Profile {
  id: string;
  characterId: string;
  totalKills: number | null;
  totalWipes: number | null;
  avgParse: number | null;
  medianParse: number | null;
  bestParse: number | null;
  totalDeaths: number | null;
  avgDeathsPerKill: number | null;
  firstDeathRate: number | null;
  avgTimeOfDeath: number | null;
  defensiveUsageRate: number | null;
  healthstoneUsageRate: number | null;
  healthPotionUsageRate: number | null;
  currentMplusScore: number | null;
  totalRuns: number | null;
  timedRate: number | null;
  parseTier: string | null;
  processingTier: string | null;
  updatedAt: string;
}

interface BossStat {
  id: string;
  characterId: string;
  bossId: string | null;
  encounterId: number | null;
  bossName: string;
  raidName: string;
  kills: number | null;
  bestParse: number | null;
  medianParse: number | null;
  worstParse: number | null;
  avgParse: number | null;
  totalDeaths: number | null;
  avgDeathsPerKill: number | null;
  firstDeathRate: number | null;
  avgTimeOfDeath: number | null;
  defensiveUsageRate: number | null;
  healthstoneUsageRate: number | null;
  healthPotionUsageRate: number | null;
  parseTier: string | null;
  updatedAt: string;
}

interface AiSummary {
  id: string;
  characterId: string;
  verdict: string | null;
  summary: string | null;
  strengths: string[];
  improvements: string[];
  pitfalls: string[];
  modelUsed: string | null;
  rawResponse: unknown;
  generatedAt: string | null;
  updatedAt: string;
}

interface ProcessingState {
  id: string;
  characterId: string;
  lightweightStatus: string | null;
  deepScanStatus: string | null;
  currentStep: string | null;
  stepsCompleted: string[];
  totalSteps: number | null;
  errorMessage: string | null;
  lightweightCompletedAt: string | null;
  deepScanCompletedAt: string | null;
  updatedAt: string;
}

interface Parse {
  id: string;
  characterId: string;
  fightId: string | null;
  encounterId: number | null;
  difficulty: number | null;
  reportCode: string | null;
  wclFightId: number | null;
  percentile: number | null;
  dps: number | null;
  hps: number | null;
  spec: string | null;
  ilvl: number | null;
  duration: number | null;
  killOrWipe: string | null;
  startTime: string | null;
  rawData: unknown;
  createdAt: string;
}

interface MythicPlusScore {
  id: string;
  characterId: string;
  seasonSlug: string | null;
  overallScore: number | null;
  tankScore: number | null;
  healerScore: number | null;
  dpsScore: number | null;
  rawData: unknown;
  createdAt: string;
}

interface MythicPlusRun {
  id: string;
  characterId: string;
  seasonSlug: string | null;
  dungeonName: string | null;
  dungeonSlug: string | null;
  keyLevel: number | null;
  score: number | null;
  timed: boolean | null;
  completedAt: string | null;
  numKeystoneUpgrades: number | null;
  duration: number | null;
  rawData: unknown;
  createdAt: string;
}

interface Achievement {
  id: string;
  characterId: string;
  achievementId: number | null;
  achievementName: string | null;
  completedTimestamp: string | null;
  raidName: string | null;
  type: string | null;
  createdAt: string;
}

interface CharacterData {
  character: Character | null;
  profile: Profile | null;
  bossStats: BossStat[];
  aiSummary: AiSummary | null;
  processing: ProcessingState | null;
  parses: Parse[];
  mythicPlusScores: MythicPlusScore[];
  mythicPlusRuns: MythicPlusRun[];
  achievements: Achievement[];
  error?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatNumber(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined) return "—";
  return n.toFixed(decimals);
}

function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isProcessing(processing: ProcessingState | null): boolean {
  if (!processing) return false;
  return (
    processing.lightweightStatus === "in_progress" ||
    processing.lightweightStatus === "pending" ||
    processing.deepScanStatus === "in_progress" ||
    processing.deepScanStatus === "pending"
  );
}

function getMplusScoreColor(score: number | null | undefined): string {
  if (!score) return "#666666";
  if (score >= 3000) return "#ff8000";
  if (score >= 2500) return "#a335ee";
  if (score >= 2000) return "#0070ff";
  if (score >= 1500) return "#1eff00";
  return "#666666";
}

// ─── Page Component ────────────────────────────────────────────────────

export default function CharacterProfilePage() {
  const params = useParams();
  const realm = params.realm as string;
  const name = params.name as string;

  const [data, setData] = useState<CharacterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCharacter = useCallback(async () => {
    try {
      const response = await api.api.characters({ realm })({ name }).get();

      if (response.data) {
        const d = response.data as unknown as CharacterData;
        setData(d);
        if (d.error && !d.character) {
          setError(d.error);
        } else {
          setError(null);
        }
      } else {
        setError("Failed to fetch character data");
      }
    } catch {
      setError("Failed to fetch character data");
    } finally {
      setLoading(false);
    }
  }, [realm, name]);

  useEffect(() => {
    fetchCharacter();
  }, [fetchCharacter]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const pollInterval = data && isProcessing(data.processing) ? 3000 : 30000;

    intervalRef.current = setInterval(() => {
      fetchCharacter();
    }, pollInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [data, fetchCharacter]);

  // ─── Loading State ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="container mx-auto max-w-screen-2xl px-4 py-8 space-y-6">
        <div className="flex items-center gap-6">
          <Skeleton className="h-24 w-24 rounded-full" />
          <div className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // ─── Not Found ─────────────────────────────────────────────────────
  if (error || !data?.character) {
    return (
      <div className="container mx-auto max-w-screen-2xl px-4 py-16 flex flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-16 w-16 text-muted-foreground" />
        <h1 className="text-2xl font-bold text-foreground">Character not found</h1>
        <p className="text-muted-foreground">{error ?? `Could not find "${decodeURIComponent(name)}" on ${decodeURIComponent(realm)}.`}</p>
      </div>
    );
  }

  const { character, profile, bossStats, aiSummary, processing, mythicPlusScores, mythicPlusRuns, achievements } = data;

  // Group boss stats by raid
  const bossStatsByRaid = bossStats.reduce<Record<string, BossStat[]>>((acc, boss) => {
    const raid = boss.raidName || "Unknown Raid";
    if (!acc[raid]) acc[raid] = [];
    acc[raid].push(boss);
    return acc;
  }, {});

  const cuttingEdge = achievements.filter((a) => a.type === "cutting_edge");
  const aheadOfTheCurve = achievements.filter((a) => a.type === "ahead_of_the_curve");

  const currentScore = mythicPlusScores.length > 0 ? mythicPlusScores[0] : null;

  return (
    <div className="container mx-auto max-w-screen-2xl px-4 py-8 space-y-8">
      {/* ── Header Section ──────────────────────────────────────────── */}
      <div
        className="flex flex-col sm:flex-row items-start sm:items-center gap-6 rounded-xl border p-6"
        style={{
          borderColor: getFactionColor(character.faction),
          borderWidth: 2,
        }}
      >
        {/* Profile picture */}
        <div className="relative shrink-0">
          {character.profilePicUrl ? (
            <Image src={character.profilePicUrl} alt={character.name} width={96} height={96} className="h-24 w-24 rounded-full object-cover ring-2 ring-border" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted ring-2 ring-border">
              <span className="text-3xl font-bold" style={{ color: getClassColor(character.className) }}>
                {character.name[0]?.toUpperCase()}
              </span>
            </div>
          )}
          {isProcessing(processing) && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-primary" />
            </span>
          )}
        </div>

        {/* Character info */}
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: getClassColor(character.className) }}>
              {character.name}
            </h1>
            <span className="text-lg text-muted-foreground">{character.realm}</span>
            {character.faction && (
              <Badge
                variant="outline"
                style={{
                  borderColor: getFactionColor(character.faction),
                  color: getFactionColor(character.faction),
                }}
              >
                {character.faction}
              </Badge>
            )}
          </div>

          {character.guild && <p className="text-muted-foreground">&lt;{character.guild}&gt;</p>}

          <p className="text-sm text-muted-foreground">{[character.race, character.specName, character.className].filter(Boolean).join(" ")}</p>

          {/* Quick stats */}
          {profile && (
            <div className="flex items-center gap-4 pt-2 flex-wrap">
              {profile.bestParse !== null && (
                <div className="flex items-center gap-1.5">
                  <Trophy className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Best:</span>
                  <span className="text-sm font-semibold" style={{ color: getParseColor(profile.bestParse) }}>
                    {formatNumber(profile.bestParse, 1)}
                  </span>
                </div>
              )}
              {profile.medianParse !== null && (
                <div className="flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Median:</span>
                  <span className="text-sm font-semibold" style={{ color: getParseColor(profile.medianParse) }}>
                    {formatNumber(profile.medianParse, 1)}
                  </span>
                </div>
              )}
              {profile.currentMplusScore !== null && (
                <div className="flex items-center gap-1.5">
                  <Swords className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">M+:</span>
                  <span
                    className="text-sm font-semibold"
                    style={{
                      color: getMplusScoreColor(profile.currentMplusScore),
                    }}
                  >
                    {formatNumber(profile.currentMplusScore, 0)}
                  </span>
                </div>
              )}
              {profile.totalKills !== null && (
                <div className="flex items-center gap-1.5">
                  <Skull className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Kills:</span>
                  <span className="text-sm font-semibold text-foreground">{profile.totalKills}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Processing Status Banner ────────────────────────────────── */}
      {processing &&
        (processing.lightweightStatus === "in_progress" ||
          processing.lightweightStatus === "pending" ||
          processing.deepScanStatus === "in_progress" ||
          processing.deepScanStatus === "pending") && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="flex items-center gap-4 py-4">
              <div className="relative shrink-0">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{processing.currentStep ?? "Processing character data..."}</p>
                  <span className="text-xs text-muted-foreground">
                    {processing.stepsCompleted?.length ?? 0} / {processing.totalSteps ?? "?"}
                  </span>
                </div>
                <Progress value={processing.totalSteps ? ((processing.stepsCompleted?.length ?? 0) / processing.totalSteps) * 100 : 0} className="h-2" />
              </div>
            </CardContent>
          </Card>
        )}

      {processing?.errorMessage && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{processing.errorMessage}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Main Content Tabs ───────────────────────────────────────── */}
      <Tabs defaultValue="raids" className="space-y-6">
        <TabsList>
          <TabsTrigger value="raids">
            <Swords className="mr-1.5 h-4 w-4" />
            Raids
          </TabsTrigger>
          <TabsTrigger value="mplus">
            <Timer className="mr-1.5 h-4 w-4" />
            Mythic+
          </TabsTrigger>
          <TabsTrigger value="achievements">
            <Trophy className="mr-1.5 h-4 w-4" />
            Achievements
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Brain className="mr-1.5 h-4 w-4" />
            AI Summary
          </TabsTrigger>
        </TabsList>

        {/* ── Raid Performance Tab ────────────────────────────────── */}
        <TabsContent value="raids" className="space-y-6">
          {Object.keys(bossStatsByRaid).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Swords className="h-12 w-12 text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">No raid data available yet.</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(bossStatsByRaid).map(([raidName, bosses]) => (
              <Card key={raidName}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Swords className="h-5 w-5" />
                    {raidName}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-2 pr-4 font-medium">Boss</th>
                          <th className="text-center py-2 px-2 font-medium">Kills</th>
                          <th className="text-center py-2 px-2 font-medium">Best</th>
                          <th className="text-center py-2 px-2 font-medium">Median</th>
                          <th className="text-center py-2 px-2 font-medium">Avg</th>
                          <th className="text-center py-2 px-2 font-medium">Deaths</th>
                          <th className="text-center py-2 px-2 font-medium">Avg/Kill</th>
                          <th className="text-center py-2 px-2 font-medium">1st Death%</th>
                          <th className="text-center py-2 px-2 font-medium">Def%</th>
                          <th className="text-center py-2 px-2 font-medium">HS%</th>
                          <th className="text-center py-2 px-2 font-medium">HP%</th>
                          <th className="text-center py-2 px-2 font-medium">Tier</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bosses.map((boss) => {
                          const tier = getParseTier(boss.bestParse);
                          return (
                            <tr key={boss.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                              <td className="py-2.5 pr-4 font-medium text-foreground">{boss.bossName}</td>
                              <td className="text-center py-2.5 px-2 text-muted-foreground">{boss.kills ?? 0}</td>
                              <td className="text-center py-2.5 px-2">
                                <span
                                  className="font-semibold"
                                  style={{
                                    color: getParseColor(boss.bestParse),
                                  }}
                                >
                                  {formatNumber(boss.bestParse)}
                                </span>
                              </td>
                              <td className="text-center py-2.5 px-2">
                                <span
                                  style={{
                                    color: getParseColor(boss.medianParse),
                                  }}
                                >
                                  {formatNumber(boss.medianParse)}
                                </span>
                              </td>
                              <td className="text-center py-2.5 px-2">
                                <span
                                  style={{
                                    color: getParseColor(boss.avgParse),
                                  }}
                                >
                                  {formatNumber(boss.avgParse)}
                                </span>
                              </td>
                              <td className="text-center py-2.5 px-2 text-muted-foreground">{boss.totalDeaths ?? 0}</td>
                              <td className="text-center py-2.5 px-2 text-muted-foreground">{formatNumber(boss.avgDeathsPerKill, 2)}</td>
                              <td className="text-center py-2.5 px-2 text-muted-foreground">{formatPercent(boss.firstDeathRate)}</td>
                              <td className="text-center py-2.5 px-2 text-muted-foreground">{formatPercent(boss.defensiveUsageRate)}</td>
                              <td className="text-center py-2.5 px-2 text-muted-foreground">{formatPercent(boss.healthstoneUsageRate)}</td>
                              <td className="text-center py-2.5 px-2 text-muted-foreground">{formatPercent(boss.healthPotionUsageRate)}</td>
                              <td className="text-center py-2.5 px-2">
                                <Badge
                                  variant="outline"
                                  className="text-xs"
                                  style={{
                                    borderColor: tier.color,
                                    color: tier.color,
                                  }}
                                >
                                  {tier.label}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))
          )}

          {/* Overall raid stats summary */}
          {profile && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Overall Raid Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Kills</p>
                    <p className="text-2xl font-bold text-foreground">{profile.totalKills ?? 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Wipes</p>
                    <p className="text-2xl font-bold text-foreground">{profile.totalWipes ?? 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Deaths</p>
                    <p className="text-2xl font-bold text-foreground">{profile.totalDeaths ?? 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Deaths / Kill</p>
                    <p className="text-2xl font-bold text-foreground">{formatNumber(profile.avgDeathsPerKill, 2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Mythic+ Tab ─────────────────────────────────────────── */}
        <TabsContent value="mplus" className="space-y-6">
          {/* Current M+ Score */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="h-5 w-5" />
                Mythic+ Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              {profile?.currentMplusScore != null ? (
                <div className="space-y-4">
                  <div className="flex items-baseline gap-3">
                    <span
                      className="text-5xl font-black tracking-tight"
                      style={{
                        color: getMplusScoreColor(profile.currentMplusScore),
                      }}
                    >
                      {Math.round(profile.currentMplusScore)}
                    </span>
                    <span className="text-lg text-muted-foreground">overall</span>
                  </div>

                  {currentScore && (
                    <div className="flex items-center gap-6 flex-wrap">
                      {currentScore.dpsScore != null && currentScore.dpsScore > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Swords className="h-4 w-4 text-red-400" />
                          <span className="text-sm text-muted-foreground">DPS:</span>
                          <span className="text-sm font-semibold text-foreground">{Math.round(currentScore.dpsScore)}</span>
                        </div>
                      )}
                      {currentScore.healerScore != null && currentScore.healerScore > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Activity className="h-4 w-4 text-green-400" />
                          <span className="text-sm text-muted-foreground">Healer:</span>
                          <span className="text-sm font-semibold text-foreground">{Math.round(currentScore.healerScore)}</span>
                        </div>
                      )}
                      {currentScore.tankScore != null && currentScore.tankScore > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Shield className="h-4 w-4 text-blue-400" />
                          <span className="text-sm text-muted-foreground">Tank:</span>
                          <span className="text-sm font-semibold text-foreground">{Math.round(currentScore.tankScore)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {profile.totalRuns != null && (
                    <div className="flex items-center gap-6 pt-2 border-t border-border/50">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-muted-foreground">Total Runs:</span>
                        <span className="text-sm font-semibold text-foreground">{profile.totalRuns}</span>
                      </div>
                      {profile.timedRate != null && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-muted-foreground">Timed:</span>
                          <span className="text-sm font-semibold text-foreground">{(profile.timedRate * 100).toFixed(1)}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center py-8">
                  <Timer className="h-12 w-12 text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">No M+ data available.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Best Runs */}
          {mythicPlusRuns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Best Runs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">Dungeon</th>
                        <th className="text-center py-2 px-2 font-medium">Key</th>
                        <th className="text-center py-2 px-2 font-medium">Score</th>
                        <th className="text-center py-2 px-2 font-medium">Timed</th>
                        <th className="text-center py-2 px-2 font-medium">Upgrades</th>
                        <th className="text-center py-2 px-2 font-medium">Duration</th>
                        <th className="text-right py-2 pl-2 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mythicPlusRuns.map((run) => (
                        <tr key={run.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                          <td className="py-2.5 pr-4 font-medium text-foreground">{run.dungeonName ?? "Unknown"}</td>
                          <td className="text-center py-2.5 px-2 font-semibold text-foreground">+{run.keyLevel}</td>
                          <td className="text-center py-2.5 px-2">
                            <span
                              className="font-semibold"
                              style={{
                                color: getMplusScoreColor(run.score),
                              }}
                            >
                              {formatNumber(run.score, 1)}
                            </span>
                          </td>
                          <td className="text-center py-2.5 px-2">
                            {run.timed ? (
                              <Badge variant="outline" className="border-green-500 text-green-500 text-xs">
                                Timed
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-red-500 text-red-500 text-xs">
                                Depleted
                              </Badge>
                            )}
                          </td>
                          <td className="text-center py-2.5 px-2 text-muted-foreground">{run.numKeystoneUpgrades != null ? `+${run.numKeystoneUpgrades}` : "—"}</td>
                          <td className="text-center py-2.5 px-2 text-muted-foreground">{formatDuration(run.duration)}</td>
                          <td className="text-right py-2.5 pl-2 text-muted-foreground">{formatDate(run.completedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Historical Scores */}
          {mythicPlusScores.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Score History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {mythicPlusScores.map((score) => (
                    <div key={score.id} className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-2.5">
                      <span className="text-sm text-muted-foreground">{score.seasonSlug ?? "Unknown Season"}</span>
                      <span
                        className="text-sm font-semibold"
                        style={{
                          color: getMplusScoreColor(score.overallScore),
                        }}
                      >
                        {formatNumber(score.overallScore, 0)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Achievements Tab ────────────────────────────────────── */}
        <TabsContent value="achievements" className="space-y-6">
          {cuttingEdge.length === 0 && aheadOfTheCurve.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Trophy className="h-12 w-12 text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">No raid achievements found.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {cuttingEdge.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-orange-400">
                      <Skull className="h-5 w-5" />
                      Cutting Edge
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {cuttingEdge.map((ach) => (
                        <Badge key={ach.id} variant="outline" className="border-orange-500/50 text-orange-400 py-1.5 px-3">
                          <div className="flex flex-col">
                            <span className="font-medium">{ach.raidName ?? ach.achievementName}</span>
                            <span className="text-[10px] opacity-70">{formatDate(ach.completedTimestamp)}</span>
                          </div>
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {aheadOfTheCurve.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-purple-400">
                      <Trophy className="h-5 w-5" />
                      Ahead of the Curve
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {aheadOfTheCurve.map((ach) => (
                        <Badge key={ach.id} variant="outline" className="border-purple-500/50 text-purple-400 py-1.5 px-3">
                          <div className="flex flex-col">
                            <span className="font-medium">{ach.raidName ?? ach.achievementName}</span>
                            <span className="text-[10px] opacity-70">{formatDate(ach.completedTimestamp)}</span>
                          </div>
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── AI Summary Tab ──────────────────────────────────────── */}
        <TabsContent value="ai" className="space-y-6">
          {aiSummary ? (
            <>
              {/* Verdict */}
              {aiSummary.verdict && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="py-5">
                    <div className="flex items-start gap-3">
                      <Brain className="h-6 w-6 shrink-0 text-primary mt-0.5" />
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Verdict</p>
                        <p className="text-lg font-semibold text-foreground">{aiSummary.verdict}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Summary */}
              {aiSummary.summary && (
                <Card>
                  <CardContent className="py-5">
                    <p className="text-sm leading-relaxed text-muted-foreground">{aiSummary.summary}</p>
                  </CardContent>
                </Card>
              )}

              {/* Strengths / Improvements / Pitfalls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Strengths */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-green-400">
                      <TrendingUp className="h-4 w-4" />
                      Strengths
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {aiSummary.strengths.length > 0 ? (
                      <ul className="space-y-2">
                        {aiSummary.strengths.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <ChevronRight className="h-4 w-4 shrink-0 text-green-400 mt-0.5" />
                            <span className="text-muted-foreground">{s}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">None identified.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Improvements */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-yellow-400">
                      <TrendingDown className="h-4 w-4" />
                      Improvements
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {aiSummary.improvements.length > 0 ? (
                      <ul className="space-y-2">
                        {aiSummary.improvements.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <ChevronRight className="h-4 w-4 shrink-0 text-yellow-400 mt-0.5" />
                            <span className="text-muted-foreground">{s}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">None identified.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Pitfalls */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-red-400">
                      <AlertTriangle className="h-4 w-4" />
                      Pitfalls
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {aiSummary.pitfalls.length > 0 ? (
                      <ul className="space-y-2">
                        {aiSummary.pitfalls.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <ChevronRight className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                            <span className="text-muted-foreground">{s}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">None identified.</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {aiSummary.modelUsed && (
                <p className="text-xs text-muted-foreground text-right">
                  Generated by {aiSummary.modelUsed} on {formatDate(aiSummary.generatedAt)}
                </p>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Brain className="h-12 w-12 text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">{isProcessing(processing) ? "AI summary is generating..." : "AI summary not available."}</p>
                {isProcessing(processing) && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mt-3" />}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
