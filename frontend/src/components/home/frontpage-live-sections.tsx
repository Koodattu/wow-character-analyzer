"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { bindJsonSseEvents, openEventSource } from "@/lib/sse";
import { getClassColor, getParseColor } from "@/lib/wow-constants";
const FRONTPAGE_CARD_CLASS = "h-36 transition-colors hover:bg-accent cursor-pointer";

interface ProcessingCharacter {
  id: string;
  name: string;
  realm: string;
  realmSlug: string;
  className: string | null;
  profilePicUrl: string | null;
  currentStep: string | null;
  stepsCompleted: string[] | null;
  totalSteps: number;
}

interface ProcessedCharacter {
  id: string;
  name: string;
  realm: string;
  realmSlug: string;
  className: string | null;
  guild: string | null;
  profilePicUrl: string | null;
  bestParse: number | null;
  currentMplusScore: number | null;
}

interface WaitingCharacter {
  id: string;
  name: string;
  realm: string;
  realmSlug: string;
  className: string | null;
  profilePicUrl: string | null;
}

interface FrontpagePayload {
  processingCharacters?: ProcessingCharacter[];
  processedCharacters?: ProcessedCharacter[];
  waitingCharacters?: WaitingCharacter[];
}

export function FrontpageLiveSections() {
  const [processingCharacters, setProcessingCharacters] = useState<ProcessingCharacter[]>([]);
  const [processedCharacters, setProcessedCharacters] = useState<ProcessedCharacter[]>([]);
  const [waitingCharacters, setWaitingCharacters] = useState<WaitingCharacter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stream = openEventSource("/api/characters/frontpage/stream");

    return bindJsonSseEvents<FrontpagePayload>(stream, (payload) => {
      if (Array.isArray(payload.processingCharacters)) {
        setProcessingCharacters(payload.processingCharacters);
      }

      if (Array.isArray(payload.processedCharacters)) {
        setProcessedCharacters(payload.processedCharacters);
      }

      if (Array.isArray(payload.waitingCharacters)) {
        setWaitingCharacters(payload.waitingCharacters);
      }

      setLoading(false);
    });
  }, []);

  const currentCharacter = processingCharacters[0] ?? null;

  return (
    <>
      {(loading || currentCharacter) && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <h2 className="text-2xl font-bold">Currently Processing</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {loading && !currentCharacter ? (
              <Card className={FRONTPAGE_CARD_CLASS}>
                <CardContent className="h-full p-4 flex flex-col justify-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>
            ) : (
              currentCharacter && (
                <Link href={`/character/${currentCharacter.realmSlug}/${currentCharacter.name.toLowerCase()}`}>
                  <Card className={FRONTPAGE_CARD_CLASS}>
                    <CardContent className="h-full p-4">
                      <div className="flex items-center gap-3 mb-3">
                        {currentCharacter.profilePicUrl ? (
                          <Image
                            src={currentCharacter.profilePicUrl}
                            alt={currentCharacter.name}
                            width={40}
                            height={40}
                            unoptimized
                            className="h-10 w-10 rounded-full border border-border"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center font-bold">{currentCharacter.name[0]}</div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold truncate" style={{ color: getClassColor(currentCharacter.className) }}>
                            {currentCharacter.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{currentCharacter.realm}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground truncate">{currentCharacter.currentStep}</span>
                          <Badge variant="secondary" className="text-xs">
                            {currentCharacter.stepsCompleted?.length ?? 0}/{currentCharacter.totalSteps}
                          </Badge>
                        </div>
                        <Progress value={((currentCharacter.stepsCompleted?.length ?? 0) / currentCharacter.totalSteps) * 100} className="h-1.5" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-2xl font-bold mb-6">Processed Characters</h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className={FRONTPAGE_CARD_CLASS}>
                <CardContent className="h-full p-4 flex flex-col justify-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : processedCharacters.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">No processed characters yet. Queue a character to get started!</CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {processedCharacters.map((char) => (
              <Link key={char.id} href={`/character/${char.realmSlug}/${char.name.toLowerCase()}`}>
                <Card className={FRONTPAGE_CARD_CLASS}>
                  <CardContent className="h-full p-4">
                    <div className="flex items-start gap-3">
                      {char.profilePicUrl ? (
                        <Image src={char.profilePicUrl} alt={char.name} width={48} height={48} unoptimized className="h-12 w-12 rounded-full border border-border" />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-lg font-bold">{char.name[0]}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate" style={{ color: getClassColor(char.className) }}>
                          {char.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {char.realm}
                          {char.guild && ` · ${char.guild}`}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {char.bestParse !== null && (
                            <Badge variant="outline" className="text-xs" style={{ color: getParseColor(char.bestParse), borderColor: getParseColor(char.bestParse) }}>
                              Best: {char.bestParse.toFixed(0)}
                            </Badge>
                          )}
                          {char.currentMplusScore !== null && char.currentMplusScore > 0 && (
                            <Badge variant="outline" className="text-xs">
                              M+ {char.currentMplusScore.toFixed(0)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-6">Waiting To Be Processed</h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className={FRONTPAGE_CARD_CLASS}>
                <CardContent className="h-full p-4 flex flex-col justify-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : waitingCharacters.length === 0 ? (
          <CardContent className="p-8 text-center text-muted-foreground">No characters are currently waiting to be processed.</CardContent>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {waitingCharacters.map((char) => (
              <Link key={char.id} href={`/character/${char.realmSlug}/${char.name.toLowerCase()}`}>
                <Card className={FRONTPAGE_CARD_CLASS}>
                  <CardContent className="h-full p-4">
                    <div className="flex items-start gap-3">
                      {char.profilePicUrl ? (
                        <Image src={char.profilePicUrl} alt={char.name} width={48} height={48} unoptimized className="h-12 w-12 rounded-full border border-border" />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-lg font-bold">{char.name[0]}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate" style={{ color: getClassColor(char.className) }}>
                          {char.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{char.realm}</p>
                        <div className="mt-1.5">
                          <Badge variant="outline" className="text-xs">
                            Queued
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
