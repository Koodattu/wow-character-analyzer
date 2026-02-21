"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { api, unwrap } from "@/lib/api";
import { bindJsonSseEvents, openEventSource } from "@/lib/sse";
import { getClassColor, getParseColor, getParseTier, getFactionColor } from "@/lib/wow-constants";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Shield, Skull, Swords, Trophy, Brain, Activity, Timer, TrendingUp, TrendingDown, AlertTriangle, ChevronRight, Loader2 } from "lucide-react";

// --- Types ------------------------------------------------------------------

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

// -- Structured raid types ---------------------------------------------------

interface BossSpec {
  spec: string;
  kills: number;
  bestParse: number | null;
  medianParse: number | null;
  avgParse: number | null;
}

interface BossData {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  encounterId: number | null;
  totalKills: number;
  bestParse: number | null;
  medianParse: number | null;
  avgParse: number | null;
  specs: BossSpec[];
  recentKills: Array<{
    percentile: number | null;
    dps: number | null;
    spec: string | null;
    ilvl: number | null;
    duration: number | null;
    startTime: string | null;
    reportCode: string | null;
  }>;
}

interface RaidData {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  bosses: BossData[];
}

interface ExpansionData {
  id: string;
  name: string;
  slug: string;
  raids: RaidData[];
}

// -- Structured M+ types ----------------------------------------------------

interface MplusDungeon {
  name: string;
  slug: string | null;
  bestRun: {
    keyLevel: number | null;
    score: number | null;
    timed: boolean | null;
    upgrades: number | null;
    duration: number | null;
    completedAt: string | null;
  } | null;
  totalRuns: number;
  timedRuns: number;
  depletedRuns: number;
}

interface MplusSeason {
  seasonSlug: string;
  score: {
    overall: number | null;
    tank: number;
    healer: number;
    dps: number;
  } | null;
  dungeons: MplusDungeon[];
}

interface CharacterData {
  character: Character | null;
  profile: Profile | null;
  aiSummary: AiSummary | null;
  processing: ProcessingState | null;
  achievements: Achievement[];
  raidData: ExpansionData[];
  mythicPlusData: { seasons: MplusSeason[] };
  error?: string;
}

// --- Helpers ----------------------------------------------------------------

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "\u2014";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatNumber(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined) return "\u2014";
  return n.toFixed(decimals);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "\u2014";
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

/** Turn "season-tww-3" into "TWW Season 3" */
function formatSeasonSlug(slug: string): string {
  const match = slug.match(/^season-(\w+)-(\d+)$/);
  if (match) return `${match[1].toUpperCase()} Season ${match[2]}`;
  if (slug === "current") return "Current Season";
  return slug;
}

// --- Page Component ---------------------------------------------------------

export default function CharacterProfilePage() {
  const params = useParams();
  const realm = typeof params.realm === "string" ? decodeURIComponent(params.realm) : "";
  const name = typeof params.name === "string" ? decodeURIComponent(params.name) : "";

  const [data, setData] = useState<CharacterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCharacter = useCallback(async () => {
    if (!realm || !name) {
      setError("Invalid character URL");
      setLoading(false);
      return;
    }
    try {
      const response = await api.api.characters({ realm })({ name }).get();
      const d = unwrap<CharacterData>(response);
      setData(d);
      setError(d.error && !d.character ? d.error : null);
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
    if (!realm || !name) return;
    const stream = openEventSource(`/api/characters/${encodeURIComponent(realm)}/${encodeURIComponent(name)}/stream`);
    return bindJsonSseEvents<CharacterData>(stream, (payload) => {
      setData(payload);
      setError(payload.error && !payload.character ? payload.error : null);
      setLoading(false);
    });
  }, [realm, name]);

  // Default expansion tab: first with kills
  const defaultExpansionSlug = useMemo(() => {
    if (!data?.raidData) return undefined;
    for (const exp of data.raidData) for (const raid of exp.raids) if (raid.bosses.some((b) => b.totalKills > 0)) return exp.slug;
    return data.raidData[0]?.slug;
  }, [data?.raidData]);

  // Default M+ season tab: first with a score
  const defaultMplusSeason = useMemo(() => {
    if (!data?.mythicPlusData?.seasons?.length) return undefined;
    const withScore = data.mythicPlusData.seasons.find((s) => s.score && (s.score.overall ?? 0) > 0);
    return withScore?.seasonSlug ?? data.mythicPlusData.seasons[0]?.seasonSlug;
  }, [data?.mythicPlusData?.seasons]);

  // --- Loading ---
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

  // --- Not Found ---
  if (error || !data?.character) {
    return (
      <div className="container mx-auto max-w-screen-2xl px-4 py-16 flex flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-16 w-16 text-muted-foreground" />
        <h1 className="text-2xl font-bold text-foreground">Character not found</h1>
        <p className="text-muted-foreground">{error ?? `Could not find "${decodeURIComponent(name)}" on ${decodeURIComponent(realm)}.`}</p>
      </div>
    );
  }

  const { character, profile, aiSummary, processing, achievements, raidData, mythicPlusData } = data;
  const cuttingEdge = achievements.filter((a) => a.type === "cutting_edge");
  const aheadOfTheCurve = achievements.filter((a) => a.type === "ahead_of_the_curve");
  const hasRaidKills = raidData.some((exp) => exp.raids.some((r) => r.bosses.some((b) => b.totalKills > 0)));

  function getRaidSpecs(raid: RaidData): string[] {
    const s = new Set<string>();
    for (const boss of raid.bosses) for (const sp of boss.specs) s.add(sp.spec);
    return [...s].sort();
  }

  function getBossDisplay(boss: BossData, spec: string) {
    if (spec === "all") {
      return {
        kills: boss.totalKills,
        best: boss.bestParse,
        median: boss.medianParse,
        avg: boss.avgParse,
      };
    }
    const sp = boss.specs.find((s) => s.spec === spec);
    if (!sp) return { kills: 0, best: null, median: null, avg: null };
    return { kills: sp.kills, best: sp.bestParse, median: sp.medianParse, avg: sp.avgParse };
  }

  return (
    <div className="container mx-auto max-w-screen-2xl px-4 py-8 space-y-8">
      {/* -- Header --------------------------------------------------------- */}
      <div
        className="flex flex-col sm:flex-row items-start sm:items-center gap-6 rounded-xl border p-6"
        style={{ borderColor: getFactionColor(character.faction), borderWidth: 2 }}
      >
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
                  <span className="text-sm font-semibold" style={{ color: getMplusScoreColor(profile.currentMplusScore) }}>
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

      {/* -- Processing Banner ---------------------------------------------- */}
      {processing &&
        (processing.lightweightStatus === "in_progress" ||
          processing.lightweightStatus === "pending" ||
          processing.deepScanStatus === "in_progress" ||
          processing.deepScanStatus === "pending") && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="flex items-center gap-4 py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary shrink-0" />
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

      {processing?.errorMessage && (processing.lightweightStatus === "failed" || processing.deepScanStatus === "failed") && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{processing.errorMessage}</p>
          </CardContent>
        </Card>
      )}

      {/* -- Raid Performance (Expansion → Raid → Spec Tabs) --------------- */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Swords className="h-5 w-5" />
          Raid Performance
        </h2>

        {!hasRaidKills ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Swords className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">No raid data available yet.</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue={defaultExpansionSlug}>
            <TabsList>
              {raidData
                .filter((exp) => exp.raids.some((r) => r.bosses.some((b) => b.totalKills > 0)))
                .map((exp) => (
                  <TabsTrigger key={exp.slug} value={exp.slug}>
                    {exp.name}
                  </TabsTrigger>
                ))}
            </TabsList>

            {raidData.map((exp) => {
              const raidsWithKills = exp.raids.filter((r) => r.bosses.some((b) => b.totalKills > 0));
              const defaultRaidSlug = raidsWithKills[0]?.slug;

              return (
                <TabsContent key={exp.slug} value={exp.slug} className="mt-4">
                  <Tabs defaultValue={defaultRaidSlug}>
                    <TabsList>
                      {raidsWithKills.map((raid) => (
                        <TabsTrigger key={raid.slug} value={raid.slug}>
                          {raid.name}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {raidsWithKills.map((raid) => {
                      const raidSpecs = getRaidSpecs(raid);

                      return (
                        <TabsContent key={raid.slug} value={raid.slug} className="mt-4">
                          <Tabs defaultValue="all">
                            <TabsList>
                              <TabsTrigger value="all">All Specs</TabsTrigger>
                              {raidSpecs.map((spec) => (
                                <TabsTrigger key={spec} value={spec}>
                                  {spec}
                                </TabsTrigger>
                              ))}
                            </TabsList>

                            {["all", ...raidSpecs].map((spec) => (
                              <TabsContent key={spec} value={spec} className="mt-4">
                                <Card>
                                  <CardContent className="pt-6">
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="border-b text-muted-foreground">
                                            <th className="text-left py-2 pr-4 font-medium">Boss</th>
                                            <th className="text-center py-2 px-2 font-medium">Kills</th>
                                            <th className="text-center py-2 px-2 font-medium">Best</th>
                                            <th className="text-center py-2 px-2 font-medium">Median</th>
                                            <th className="text-center py-2 px-2 font-medium">Avg</th>
                                            <th className="text-center py-2 px-2 font-medium">Tier</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {raid.bosses.map((boss) => {
                                            const d = getBossDisplay(boss, spec);
                                            const tier = getParseTier(d.best);
                                            return (
                                              <tr key={boss.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                                                <td className="py-2.5 pr-4 font-medium text-foreground">{boss.name}</td>
                                                <td className="text-center py-2.5 px-2 text-muted-foreground">{d.kills}</td>
                                                <td className="text-center py-2.5 px-2">
                                                  <span className="font-semibold" style={{ color: getParseColor(d.best) }}>
                                                    {formatNumber(d.best)}
                                                  </span>
                                                </td>
                                                <td className="text-center py-2.5 px-2">
                                                  <span style={{ color: getParseColor(d.median) }}>{formatNumber(d.median)}</span>
                                                </td>
                                                <td className="text-center py-2.5 px-2">
                                                  <span style={{ color: getParseColor(d.avg) }}>{formatNumber(d.avg)}</span>
                                                </td>
                                                <td className="text-center py-2.5 px-2">
                                                  <Badge variant="outline" className="text-xs" style={{ borderColor: tier.color, color: tier.color }}>
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
                              </TabsContent>
                            ))}
                          </Tabs>
                        </TabsContent>
                      );
                    })}
                  </Tabs>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </section>

      {/* -- Mythic+ (Season Tabs) ------------------------------------------ */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Timer className="h-5 w-5" />
          Mythic+
        </h2>

        {mythicPlusData.seasons.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Timer className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">No M+ data available yet.</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue={defaultMplusSeason}>
            <TabsList>
              {mythicPlusData.seasons.map((season) => (
                <TabsTrigger key={season.seasonSlug} value={season.seasonSlug}>
                  {formatSeasonSlug(season.seasonSlug)}
                </TabsTrigger>
              ))}
            </TabsList>

            {mythicPlusData.seasons.map((season) => (
              <TabsContent key={season.seasonSlug} value={season.seasonSlug} className="space-y-4 mt-4">
                {/* Season score */}
                {season.score && (season.score.overall ?? 0) > 0 && (
                  <Card>
                    <CardContent className="py-5">
                      <div className="flex items-center gap-6 flex-wrap">
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl font-black tracking-tight" style={{ color: getMplusScoreColor(season.score.overall) }}>
                            {Math.round(season.score.overall ?? 0)}
                          </span>
                          <span className="text-sm text-muted-foreground">overall</span>
                        </div>
                        <div className="flex items-center gap-5 flex-wrap">
                          {season.score.dps > 0 && (
                            <div className="flex items-center gap-1.5">
                              <Swords className="h-4 w-4 text-red-400" />
                              <span className="text-sm text-muted-foreground">DPS:</span>
                              <span className="text-sm font-semibold text-foreground">{Math.round(season.score.dps)}</span>
                            </div>
                          )}
                          {season.score.healer > 0 && (
                            <div className="flex items-center gap-1.5">
                              <Activity className="h-4 w-4 text-green-400" />
                              <span className="text-sm text-muted-foreground">Healer:</span>
                              <span className="text-sm font-semibold text-foreground">{Math.round(season.score.healer)}</span>
                            </div>
                          )}
                          {season.score.tank > 0 && (
                            <div className="flex items-center gap-1.5">
                              <Shield className="h-4 w-4 text-blue-400" />
                              <span className="text-sm text-muted-foreground">Tank:</span>
                              <span className="text-sm font-semibold text-foreground">{Math.round(season.score.tank)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Dungeon table */}
                {season.dungeons.length > 0 ? (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="text-left py-2 pr-4 font-medium">Dungeon</th>
                              <th className="text-center py-2 px-2 font-medium">Best Key</th>
                              <th className="text-center py-2 px-2 font-medium">Score</th>
                              <th className="text-center py-2 px-2 font-medium">Timed</th>
                              <th className="text-center py-2 px-2 font-medium">Runs</th>
                              <th className="text-center py-2 px-2 font-medium">In Time</th>
                              <th className="text-center py-2 px-2 font-medium">Depleted</th>
                              <th className="text-center py-2 px-2 font-medium">Duration</th>
                              <th className="text-right py-2 pl-2 font-medium">Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {season.dungeons.map((dg) => (
                              <tr key={dg.name} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                                <td className="py-2.5 pr-4 font-medium text-foreground">{dg.name}</td>
                                <td className="text-center py-2.5 px-2 font-semibold text-foreground">{dg.bestRun ? `+${dg.bestRun.keyLevel}` : "\u2014"}</td>
                                <td className="text-center py-2.5 px-2">
                                  <span
                                    className="font-semibold"
                                    style={{
                                      color: getMplusScoreColor(dg.bestRun?.score),
                                    }}
                                  >
                                    {dg.bestRun ? formatNumber(dg.bestRun.score, 1) : "\u2014"}
                                  </span>
                                </td>
                                <td className="text-center py-2.5 px-2">
                                  {dg.bestRun ? (
                                    dg.bestRun.timed ? (
                                      <Badge variant="outline" className="border-green-500 text-green-500 text-xs">
                                        Timed
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="border-red-500 text-red-500 text-xs">
                                        Depleted
                                      </Badge>
                                    )
                                  ) : (
                                    "\u2014"
                                  )}
                                </td>
                                <td className="text-center py-2.5 px-2 text-muted-foreground">{dg.totalRuns}</td>
                                <td className="text-center py-2.5 px-2 text-green-400">{dg.timedRuns}</td>
                                <td className="text-center py-2.5 px-2 text-red-400">{dg.depletedRuns}</td>
                                <td className="text-center py-2.5 px-2 text-muted-foreground">{formatDuration(dg.bestRun?.duration)}</td>
                                <td className="text-right py-2.5 pl-2 text-muted-foreground">{formatDate(dg.bestRun?.completedAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-8">
                      <p className="text-muted-foreground">No dungeon runs recorded for this season.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </section>

      {/* -- Achievements --------------------------------------------------- */}
      <section className="space-y-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Trophy className="h-5 w-5" />
          Achievements
        </h2>
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
      </section>

      {/* -- AI Summary ----------------------------------------------------- */}
      <section className="space-y-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Brain className="h-5 w-5" />
          AI Summary
        </h2>
        {aiSummary ? (
          <>
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
            {aiSummary.summary && (
              <Card>
                <CardContent className="py-5">
                  <p className="text-sm leading-relaxed text-muted-foreground">{aiSummary.summary}</p>
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      </section>
    </div>
  );
}
