"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { getClassColor } from "@/lib/wow-constants";
import { Progress } from "@/components/ui/progress";

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
    async function fetchProcessing() {
      try {
        const response = await api.api.characters.processing.get();
        if (response.data && "characters" in response.data) {
          setCharacters(response.data.characters as ProcessingCharacter[]);
        }
      } catch {
        // API not available yet
      }
    }
    fetchProcessing();

    // Poll every 5 seconds
    const interval = setInterval(fetchProcessing, 5000);
    return () => clearInterval(interval);
  }, []);

  if (characters.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <h2 className="text-2xl font-bold">Currently Processing</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {characters.map((char) => {
          const stepsCount = (char.stepsCompleted as string[])?.length ?? 0;
          const progress = (stepsCount / char.totalSteps) * 100;

          return (
            <Link key={char.id} href={`/character/${char.realmSlug}/${char.name.toLowerCase()}`}>
              <Card className="transition-colors hover:bg-accent cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    {char.profilePicUrl ? (
                      <Image src={char.profilePicUrl} alt={char.name} width={40} height={40} unoptimized className="h-10 w-10 rounded-full border border-border" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center font-bold">{char.name[0]}</div>
                    )}
                    <div>
                      <p className="font-semibold" style={{ color: getClassColor(char.className) }}>
                        {char.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{char.realm}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{char.currentStep}</span>
                      <Badge variant="secondary" className="text-xs">
                        {stepsCount}/{char.totalSteps}
                      </Badge>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
