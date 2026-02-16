"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { getClassColor } from "@/lib/wow-constants";
import { Link as LinkIcon, UserPlus, Send, Loader2, RefreshCw, Shield, Check, X, Unlink } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface BnetCharacter {
  name: string;
  realm: string;
  realmSlug: string;
  level: number;
  className: string;
  race: string;
  faction: string;
}

interface QueuedCharacter {
  id: string;
  characterId: string;
  status: string;
  character: {
    id: string;
    name: string;
    realm: string;
    realmSlug: string;
    className: string | null;
    specName: string | null;
  };
  processing: {
    lightweightStatus: string;
    deepScanStatus: string;
    currentStep: string | null;
    stepsCompleted: string[];
    totalSteps: number;
    errorMessage: string | null;
  } | null;
}

interface QueuedCharacterRow {
  queueId: string;
  queueStatus: string;
  characterId: string;
  characterName: string;
  characterRealm: string;
  characterRealmSlug: string;
  className: string | null;
  lightweightStatus: string | null;
  deepScanStatus: string | null;
  currentStep: string | null;
  stepsCompleted: string[] | null;
  totalSteps: number | null;
  errorMessage: string | null;
}

function mapQueuedRows(rows: QueuedCharacterRow[]): QueuedCharacter[] {
  return rows.map((row) => ({
    id: row.queueId,
    characterId: row.characterId,
    status: row.queueStatus,
    character: {
      id: row.characterId,
      name: row.characterName,
      realm: row.characterRealm,
      realmSlug: row.characterRealmSlug,
      className: row.className,
      specName: null,
    },
    processing: row.lightweightStatus
      ? {
          lightweightStatus: row.lightweightStatus,
          deepScanStatus: row.deepScanStatus ?? "pending",
          currentStep: row.currentStep,
          stepsCompleted: row.stepsCompleted ?? [],
          totalSteps: row.totalSteps ?? 6,
          errorMessage: row.errorMessage,
        }
      : null,
  }));
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return (
        <Badge className="bg-green-600 text-white">
          <Check className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    case "in_progress":
      return (
        <Badge className="bg-blue-600 text-white">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Processing
        </Badge>
      );
    case "pending":
      return <Badge variant="outline">Pending</Badge>;
    case "failed":
      return (
        <Badge variant="destructive">
          <X className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, unlinkProvider } = useAuth();

  // Battle.net characters
  const [bnetCharacters, setBnetCharacters] = useState<BnetCharacter[]>([]);
  const [bnetCharsLoading, setBnetCharsLoading] = useState(false);
  const [selectedChars, setSelectedChars] = useState<Set<number>>(new Set());

  // Unlink state
  const [unlinking, setUnlinking] = useState<string | null>(null);

  // Manual queue
  const [manualName, setManualName] = useState("");
  const [manualRealm, setManualRealm] = useState("");
  const [queueing, setQueueing] = useState(false);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);

  // Queued characters
  const [queuedCharacters, setQueuedCharacters] = useState<QueuedCharacter[]>([]);
  const [queuedLoading, setQueuedLoading] = useState(true);

  const bnetLinked = user?.linkedProviders?.battlenet ?? false;
  const discordLinked = user?.linkedProviders?.discord ?? false;

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  // Fetch Battle.net characters when linked
  const fetchBnetChars = useCallback(async () => {
    if (!bnetLinked) return;
    setBnetCharsLoading(true);
    try {
      const res = await api.api.user.characters.get();
      const data = res.data as Record<string, unknown> | null;
      if (data && "characters" in data) {
        setBnetCharacters((data.characters as BnetCharacter[]) ?? []);
      }
    } catch {
      // error fetching
    } finally {
      setBnetCharsLoading(false);
    }
  }, [bnetLinked]);

  useEffect(() => {
    fetchBnetChars();
  }, [fetchBnetChars]);

  // Fetch queued characters
  const fetchQueued = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.api.user.queued.get();
      const data = res.data as Record<string, unknown> | null;
      if (data && "queuedCharacters" in data && Array.isArray(data.queuedCharacters)) {
        setQueuedCharacters(mapQueuedRows(data.queuedCharacters as QueuedCharacterRow[]));
      }
    } catch {
      // error
    } finally {
      setQueuedLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchQueued();
  }, [fetchQueued]);

  // Live queued character updates over SSE
  useEffect(() => {
    if (!user) return;

    const stream = new EventSource(`${API_URL}/api/user/queued/stream`, {
      withCredentials: true,
    });

    const handleData = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as {
          queuedCharacters?: QueuedCharacterRow[];
        };

        if (Array.isArray(payload.queuedCharacters)) {
          setQueuedCharacters(mapQueuedRows(payload.queuedCharacters));
          setQueuedLoading(false);
        }
      } catch {
        // ignore malformed payload
      }
    };

    stream.addEventListener("snapshot", handleData as EventListener);
    stream.addEventListener("update", handleData as EventListener);

    stream.onerror = () => {
      // connection auto-retries
    };

    return () => {
      stream.removeEventListener("snapshot", handleData as EventListener);
      stream.removeEventListener("update", handleData as EventListener);
      stream.close();
    };
  }, [user]);

  // Toggle character selection
  const toggleChar = (idx: number) => {
    setSelectedChars((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else if (next.size < 3) {
        next.add(idx);
      }
      return next;
    });
  };

  // Queue selected Battle.net characters
  const queueSelected = async () => {
    if (selectedChars.size === 0) return;
    setQueueing(true);
    setQueueMessage(null);
    try {
      const chars = Array.from(selectedChars).map((i) => ({
        name: bnetCharacters[i].name,
        realm: bnetCharacters[i].realm,
        region: "eu",
      }));
      await api.api.characters.queue.batch.post({ characters: chars });
      setQueueMessage(`Queued ${chars.length} character${chars.length > 1 ? "s" : ""}!`);
      setSelectedChars(new Set());
      fetchQueued();
    } catch {
      setQueueMessage("Failed to queue characters");
    } finally {
      setQueueing(false);
    }
  };

  // Manual queue
  const queueManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !manualRealm.trim()) return;
    setQueueing(true);
    setQueueMessage(null);
    try {
      await api.api.characters.queue.post({
        name: manualName.trim(),
        realm: manualRealm.trim(),
        region: "eu",
      });
      setQueueMessage(`Queued ${manualName}!`);
      setManualName("");
      setManualRealm("");
      fetchQueued();
    } catch {
      setQueueMessage("Failed to queue character");
    } finally {
      setQueueing(false);
    }
  };

  // Unlink a provider
  const handleUnlink = async (provider: "discord" | "battlenet") => {
    setUnlinking(provider);
    const result = await unlinkProvider(provider);
    if (!result.success && result.error) {
      setQueueMessage(String(result.error));
    }
    setUnlinking(null);
  };

  if (authLoading) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome, {user.username ?? "Adventurer"}</p>
      </div>

      {/* Linked Accounts Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Linked Accounts
          </CardTitle>
          <CardDescription>Connect both Discord and Battle.net to get the most out of WoW Analyzer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Discord */}
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#5865F2]">
                <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm">Discord</p>
                <p className="text-xs text-muted-foreground">{discordLinked ? "Connected" : "Not connected"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {discordLinked ? (
                <>
                  <Badge className="bg-green-600 text-white">
                    <Check className="h-3 w-3 mr-1" />
                    Linked
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUnlink("discord")}
                    disabled={unlinking === "discord" || !bnetLinked}
                    title={!bnetLinked ? "Cannot unlink your only login provider" : "Unlink Discord"}
                  >
                    {unlinking === "discord" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                  </Button>
                </>
              ) : (
                <Button size="sm" asChild className="bg-[#5865F2] hover:bg-[#4752C4] text-white">
                  <a href={`${API_URL}/api/auth/discord`}>
                    <LinkIcon className="h-4 w-4 mr-1" />
                    Link
                  </a>
                </Button>
              )}
            </div>
          </div>

          {/* Battle.net */}
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#00AEFF]">
                <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10.458 0c.156 0 .296.043.404.128.608.453 1.064 1.273 1.38 2.323.104.36.196.742.272 1.148l.068.41.032.228.152-.06c1.296-.48 2.42-.648 3.272-.456.68.152 1.108.54 1.288 1.112.4 1.264-.352 3.26-1.792 5.42l-.136.196.196.164c1.94 1.648 2.94 3.3 2.736 4.54-.108.652-.516 1.132-1.172 1.376-1.388.52-3.68-.056-6.164-1.404l-.196-.108-.14.184c-1.628 2.1-3.26 3.38-4.632 3.58-.528.076-.964-.044-1.284-.36l-.1-.108-.012.004C3.964 19.616 2.64 20.772.94 21.38l-.076.024.016-.08c.176-.848.5-2.08.872-3.324l.148-.484.164-.528-.2-.004C.828 16.908.22 16.524.06 15.896c-.232-.9.376-2.16 1.584-3.54l.14-.156-.072-.2C.964 9.96.704 8.316.956 7.26c.124-.52.416-.908.86-1.14l.12-.06.004-.136C2 4.456 2.36 3.4 3.02 2.82c.66-.58 1.388-.548 1.992.044l.1.1.164-.112C6.68 1.876 8.48 1.08 9.86.652c.296-.1.46-.12.6-.12z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm">Battle.net</p>
                <p className="text-xs text-muted-foreground">{bnetLinked ? "Connected — enables WoW character import" : "Not connected"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {bnetLinked ? (
                <>
                  <Badge className="bg-green-600 text-white">
                    <Check className="h-3 w-3 mr-1" />
                    Linked
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUnlink("battlenet")}
                    disabled={unlinking === "battlenet" || !discordLinked}
                    title={!discordLinked ? "Cannot unlink your only login provider" : "Unlink Battle.net"}
                  >
                    {unlinking === "battlenet" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                  </Button>
                </>
              ) : (
                <Button size="sm" asChild className="bg-[#00AEFF] hover:bg-[#0090D0] text-white">
                  <a href={`${API_URL}/api/auth/battlenet`}>
                    <LinkIcon className="h-4 w-4 mr-1" />
                    Link
                  </a>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Battle.net Characters Section */}
      {bnetLinked && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              WoW Characters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={fetchBnetChars} disabled={bnetCharsLoading}>
                  {bnetCharsLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  {bnetCharacters.length > 0 ? "Refresh Characters" : "Load Characters"}
                </Button>
              </div>

              {bnetCharacters.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Select up to 3 characters to queue for analysis:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                    {bnetCharacters.map((char, i) => (
                      <div
                        key={`${char.name}-${char.realmSlug}`}
                        className="flex items-center gap-3 p-2 rounded-md border cursor-pointer hover:bg-accent"
                        onClick={() => toggleChar(i)}
                      >
                        <Checkbox checked={selectedChars.has(i)} disabled={!selectedChars.has(i) && selectedChars.size >= 3} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate" style={{ color: getClassColor(char.className) }}>
                            {char.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {char.realm} · {char.className} · Lv{char.level}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {char.faction}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <Button onClick={queueSelected} disabled={selectedChars.size === 0 || queueing}>
                    {queueing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                    Queue {selectedChars.size} Character{selectedChars.size !== 1 ? "s" : ""}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Queue Any Character
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={queueManual} className="flex flex-col sm:flex-row gap-3">
            <Input placeholder="Character name" value={manualName} onChange={(e) => setManualName(e.target.value)} className="flex-1" />
            <Input placeholder="Realm name" value={manualRealm} onChange={(e) => setManualRealm(e.target.value)} className="flex-1" />
            <Button type="submit" disabled={queueing || !manualName.trim() || !manualRealm.trim()}>
              {queueing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Queue
            </Button>
          </form>
          {queueMessage && <p className="text-sm mt-2 text-muted-foreground">{queueMessage}</p>}
        </CardContent>
      </Card>

      <Separator />

      {/* Queued Characters */}
      <div>
        <h2 className="text-xl font-semibold mb-4">My Queued Characters</h2>
        {queuedLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : queuedCharacters.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">No characters queued yet. Use the forms above to queue characters for analysis.</CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {queuedCharacters.map((qc) => (
              <Card
                key={qc.id}
                className="cursor-pointer hover:bg-accent transition-colors"
                onClick={() => router.push(`/character/${qc.character.realmSlug}/${qc.character.name.toLowerCase()}`)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold" style={{ color: getClassColor(qc.character.className) }}>
                      {qc.character.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {qc.character.realm}
                      {qc.character.className && ` · ${qc.character.className}`}
                      {qc.character.specName && ` (${qc.character.specName})`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {qc.processing ? (
                      <>
                        {getStatusBadge(qc.processing.lightweightStatus)}
                        {qc.processing.currentStep && <p className="text-xs text-muted-foreground">{qc.processing.currentStep}</p>}
                        {(qc.processing.lightweightStatus === "in_progress" || qc.processing.lightweightStatus === "pending") && (
                          <Progress value={(qc.processing.stepsCompleted.length / qc.processing.totalSteps) * 100} className="h-1.5 w-24" />
                        )}
                        {qc.processing.errorMessage && <p className="text-xs text-destructive">{qc.processing.errorMessage}</p>}
                      </>
                    ) : (
                      getStatusBadge(qc.status)
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
