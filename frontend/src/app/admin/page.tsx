"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Clock, Database, Loader2, RefreshCw, Settings, Zap, Activity, CheckCircle, XCircle } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────

interface QueueOverview {
  counts: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  currentlyProcessing: Array<{
    id: string;
    name: string;
    realm: string;
    className: string | null;
    currentStep: string | null;
    stepsCompleted: string[];
    totalSteps: number;
  }>;
  recent: Array<{
    id: string;
    characterId: string;
    status: string;
    createdAt: string;
  }>;
}

interface RateLimitStatus {
  wcl: { remaining: number; limit: number; resetAt: string | null };
  blizzard: { remaining: number; limit: number; resetAt: string | null };
  raiderio: { remaining: number; limit: number; resetAt: string | null };
}

interface AdminCharacter {
  id: string;
  name: string;
  realm: string;
  region: string;
  className: string | null;
  specName: string | null;
  lastFetchedAt: string | null;
  lightweightStatus: string | null;
  deepScanStatus: string | null;
  currentStep: string | null;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [queueData, setQueueData] = useState<QueueOverview | null>(null);
  const [rateLimits, setRateLimits] = useState<RateLimitStatus | null>(null);
  const [adminCharacters, setAdminCharacters] = useState<AdminCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [charactersLoading, setCharactersLoading] = useState(true);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessingCharacterId, setReprocessingCharacterId] = useState<string | null>(null);
  const [reprocessMsg, setReprocessMsg] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      router.push("/");
    }
  }, [authLoading, user, router]);

  const fetchData = useCallback(async () => {
    try {
      const [queueRes, rateRes, charactersRes] = await Promise.all([api.api.admin.queue.get(), api.api.admin["rate-limits"].get(), api.api.admin.characters.get()]);

      if (queueRes.data) {
        setQueueData(queueRes.data as unknown as QueueOverview);
      }
      if (rateRes.data) {
        const raw = rateRes.data as unknown as { rateLimits: RateLimitStatus } | RateLimitStatus;
        setRateLimits("rateLimits" in raw ? raw.rateLimits : raw);
      }
      if (charactersRes.data) {
        const raw = charactersRes.data as unknown as { characters: AdminCharacter[] };
        setAdminCharacters(raw.characters ?? []);
      }
    } catch {
      // API error
    } finally {
      setLoading(false);
      setCharactersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.isAdmin) {
      fetchData();
    }
  }, [user, fetchData]);

  // Poll every 5s
  useEffect(() => {
    if (!user?.isAdmin) return;
    pollRef.current = setInterval(fetchData, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user, fetchData]);

  const handleReprocessAll = async () => {
    if (!confirm("Reprocess ALL characters? This will drop all processed data and regenerate from raw data.")) return;
    setReprocessing(true);
    setReprocessMsg(null);
    try {
      await api.api.admin.reprocess.post({ all: true });
      setReprocessMsg("Reprocessing started for all characters");
      fetchData();
    } catch {
      setReprocessMsg("Failed to trigger reprocessing");
    } finally {
      setReprocessing(false);
    }
  };

  const handleReprocessCharacter = async (character: AdminCharacter) => {
    if (!confirm(`Reprocess ${character.name} (${character.realm})?`)) return;
    setReprocessingCharacterId(character.id);
    setReprocessMsg(null);
    try {
      await api.api.admin.reprocess.post({ characterId: character.id });
      setReprocessMsg(`Reprocessing started for ${character.name}-${character.realm}`);
      await fetchData();
    } catch {
      setReprocessMsg(`Failed to trigger reprocessing for ${character.name}-${character.realm}`);
    } finally {
      setReprocessingCharacterId(null);
    }
  };

  const statusVariant = (status: string | null | undefined): "default" | "secondary" | "destructive" | "outline" => {
    if (status === "completed") return "default";
    if (status === "in_progress" || status === "processing") return "secondary";
    if (status === "failed") return "destructive";
    return "outline";
  };

  if (authLoading) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (!user?.isAdmin) return null;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground mt-1">Queue management, rate limits, and configuration</p>
        </div>
        <Button variant="outline" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">
            <Database className="h-4 w-4 mr-1" />
            Queue
          </TabsTrigger>
          <TabsTrigger value="rate-limits">
            <Activity className="h-4 w-4 mr-1" />
            Rate Limits
          </TabsTrigger>
          <TabsTrigger value="tools">
            <Settings className="h-4 w-4 mr-1" />
            Tools
          </TabsTrigger>
        </TabsList>

        {/* Queue Tab */}
        <TabsContent value="queue" className="mt-6 space-y-6">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : queueData ? (
            <>
              {/* Count Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 flex flex-col items-center">
                    <Clock className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-2xl font-bold">{queueData.counts.pending}</p>
                    <p className="text-sm text-muted-foreground">Pending</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex flex-col items-center">
                    <Loader2 className="h-8 w-8 text-blue-500 mb-2 animate-spin" />
                    <p className="text-2xl font-bold">{queueData.counts.processing}</p>
                    <p className="text-sm text-muted-foreground">Processing</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex flex-col items-center">
                    <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
                    <p className="text-2xl font-bold">{queueData.counts.completed}</p>
                    <p className="text-sm text-muted-foreground">Completed</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex flex-col items-center">
                    <XCircle className="h-8 w-8 text-destructive mb-2" />
                    <p className="text-2xl font-bold">{queueData.counts.failed}</p>
                    <p className="text-sm text-muted-foreground">Failed</p>
                  </CardContent>
                </Card>
              </div>

              {/* Currently Processing */}
              {queueData.currentlyProcessing.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Currently Processing</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {queueData.currentlyProcessing.map((char) => (
                      <div key={char.id} className="flex items-center justify-between p-3 rounded-md border">
                        <div>
                          <p className="font-semibold">{char.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {char.realm} · {char.className ?? "Unknown"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-muted-foreground">{char.currentStep}</span>
                          <Progress value={(char.stepsCompleted.length / char.totalSteps) * 100} className="h-2 w-24" />
                          <span className="text-xs text-muted-foreground">
                            {char.stepsCompleted.length}/{char.totalSteps}
                          </span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">Failed to load queue data</CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Rate Limits Tab */}
        <TabsContent value="rate-limits" className="mt-6 space-y-6">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          ) : rateLimits ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* WCL */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">WarcraftLogs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Points Remaining</span>
                    <span className="font-medium">
                      {rateLimits.wcl.remaining} / {rateLimits.wcl.limit}
                    </span>
                  </div>
                  <Progress value={(rateLimits.wcl.remaining / rateLimits.wcl.limit) * 100} className="h-3" />
                  {rateLimits.wcl.resetAt && <p className="text-xs text-muted-foreground">Resets at {new Date(rateLimits.wcl.resetAt).toLocaleTimeString()}</p>}
                </CardContent>
              </Card>

              {/* Blizzard */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Blizzard API</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Requests Remaining</span>
                    <span className="font-medium">
                      {rateLimits.blizzard.remaining} / {rateLimits.blizzard.limit}
                    </span>
                  </div>
                  <Progress value={(rateLimits.blizzard.remaining / rateLimits.blizzard.limit) * 100} className="h-3" />
                  {rateLimits.blizzard.resetAt && <p className="text-xs text-muted-foreground">Resets at {new Date(rateLimits.blizzard.resetAt).toLocaleTimeString()}</p>}
                </CardContent>
              </Card>

              {/* Raider.IO */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Raider.IO</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Requests Remaining</span>
                    <span className="font-medium">
                      {rateLimits.raiderio.remaining} / {rateLimits.raiderio.limit}
                    </span>
                  </div>
                  <Progress value={(rateLimits.raiderio.remaining / rateLimits.raiderio.limit) * 100} className="h-3" />
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">Failed to load rate limit data</CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tools Tab */}
        <TabsContent value="tools" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Character Reprocessing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Reprocess a single character from the latest 100 tracked characters.</p>
              {charactersLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : adminCharacters.length === 0 ? (
                <p className="text-sm text-muted-foreground">No characters found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Character</TableHead>
                      <TableHead>Spec</TableHead>
                      <TableHead>Lightweight</TableHead>
                      <TableHead>Deep Scan</TableHead>
                      <TableHead>Last Fetched</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adminCharacters.map((character) => (
                      <TableRow key={character.id}>
                        <TableCell>
                          <div className="font-medium">{character.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {character.realm} · {character.region.toUpperCase()}
                          </div>
                        </TableCell>
                        <TableCell>{character.specName ?? character.className ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(character.lightweightStatus)}>{character.lightweightStatus ?? "unknown"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(character.deepScanStatus)}>{character.deepScanStatus ?? "unknown"}</Badge>
                        </TableCell>
                        <TableCell>{character.lastFetchedAt ? new Date(character.lastFetchedAt).toLocaleString() : "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReprocessCharacter(character)}
                            disabled={reprocessingCharacterId === character.id || reprocessing}
                          >
                            {reprocessingCharacterId === character.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            <span className="ml-2">Reprocess</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Reprocessing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Drop all processed data (profiles, boss stats, AI summaries) and regenerate from raw API data. This does NOT re-fetch from external APIs.
              </p>
              <Button variant="destructive" onClick={handleReprocessAll} disabled={reprocessing}>
                {reprocessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Reprocess All Characters
              </Button>
              {reprocessMsg && <p className="text-sm text-muted-foreground">{reprocessMsg}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                System Info
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total Pending</p>
                  <p className="font-medium">{queueData?.counts.pending ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Completed</p>
                  <p className="font-medium">{queueData?.counts.completed ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Failed</p>
                  <p className="font-medium">{queueData?.counts.failed ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Queue Workers</p>
                  <p className="font-medium">2 (lightweight + deep)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
