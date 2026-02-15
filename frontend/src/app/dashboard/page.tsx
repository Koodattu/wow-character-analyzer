"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { getClassColor } from "@/lib/wow-constants";
import { Link as LinkIcon, UserPlus, Send, Loader2, RefreshCw, Shield, Check, X } from "lucide-react";

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
  const { user, isLoading: authLoading } = useAuth();

  // Battle.net characters
  const [bnetLinked, setBnetLinked] = useState(false);
  const [bnetLoading, setBnetLoading] = useState(true);
  const [bnetCharacters, setBnetCharacters] = useState<BnetCharacter[]>([]);
  const [selectedChars, setSelectedChars] = useState<Set<number>>(new Set());

  // Manual queue
  const [manualName, setManualName] = useState("");
  const [manualRealm, setManualRealm] = useState("");
  const [queueing, setQueueing] = useState(false);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);

  // Queued characters
  const [queuedCharacters, setQueuedCharacters] = useState<QueuedCharacter[]>([]);
  const [queuedLoading, setQueuedLoading] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  // Check Battle.net status
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await api.api.user["bnet-status"].get();
        const data = res.data as Record<string, unknown> | null;
        if (data && "linked" in data) {
          setBnetLinked(data.linked as boolean);
        }
      } catch {
        // not linked
      } finally {
        setBnetLoading(false);
      }
    })();
  }, [user]);

  // Fetch Battle.net characters
  const fetchBnetChars = useCallback(async () => {
    if (!bnetLinked) return;
    try {
      const res = await api.api.user.characters.get();
      const data = res.data as Record<string, unknown> | null;
      if (data && "characters" in data) {
        setBnetCharacters((data.characters as BnetCharacter[]) ?? []);
      }
    } catch {
      // error fetching
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
      if (data && "characters" in data) {
        setQueuedCharacters((data.characters as QueuedCharacter[]) ?? []);
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

  // Poll queued characters every 3s
  useEffect(() => {
    if (!user) return;
    pollRef.current = setInterval(fetchQueued, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user, fetchQueued]);

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

  if (authLoading) {
    return (
      <div className="container max-w-5xl px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="container max-w-5xl px-4 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome, {user.username ?? "Adventurer"}</p>
      </div>

      {/* Battle.net Link Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Battle.net Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bnetLoading ? (
            <Skeleton className="h-10 w-48" />
          ) : bnetLinked ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-600 text-white">
                  <Check className="h-3 w-3 mr-1" />
                  Linked
                </Badge>
                <Button variant="outline" size="sm" onClick={fetchBnetChars}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh Characters
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
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Link your Battle.net account to import your WoW characters.</p>
              <Button asChild>
                <a href={`${API_URL}/api/auth/battlenet`}>
                  <LinkIcon className="h-4 w-4 mr-2" />
                  Link Battle.net
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
