"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { getClassColor } from "@/lib/wow-constants";
import { Progress } from "@/components/ui/progress";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface ProcessingCharacter {
  id: string;
  name: string;
  realm: string;
  realmSlug: string;
  className: string | null;
  specName: string | null;
  faction: string | null;
  profilePicUrl: string | null;
  currentStep: string | null;
  lightweightStatus: string;
  deepScanStatus: string;
  stepsCompleted: string[] | null;
  totalSteps: number;
}

export function ProcessingCharacters() {
  const [characters, setCharacters] = useState<ProcessingCharacter[]>([]);

  useEffect(() => {
    const stream = new EventSource(`${API_URL}/api/characters/processing/stream`, {
      withCredentials: true,
    });

    const handleData = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { characters?: ProcessingCharacter[] };
        if (Array.isArray(payload.characters)) {
          setCharacters(payload.characters);
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
  }, []);

  if (characters.length === 0) return null;

  const currentCharacter = characters[0];
  const stepsCount = (currentCharacter.stepsCompleted as string[])?.length ?? 0;
  const progress = (stepsCount / currentCharacter.totalSteps) * 100;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <h2 className="text-2xl font-bold">Currently Processing</h2>
      </div>
      <Link href={`/character/${currentCharacter.realmSlug}/${currentCharacter.name.toLowerCase()}`}>
        <Card className="transition-colors hover:bg-accent cursor-pointer">
          <CardContent className="p-4">
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
              <div>
                <p className="font-semibold" style={{ color: getClassColor(currentCharacter.className) }}>
                  {currentCharacter.name}
                </p>
                <p className="text-xs text-muted-foreground">{currentCharacter.realm}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{currentCharacter.currentStep}</span>
                <Badge variant="secondary" className="text-xs">
                  {stepsCount}/{currentCharacter.totalSteps}
                </Badge>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
          </CardContent>
        </Card>
      </Link>
    </section>
  );
}
