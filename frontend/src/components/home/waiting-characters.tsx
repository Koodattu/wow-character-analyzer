"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getClassColor } from "@/lib/wow-constants";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface WaitingCharacter {
  id: string;
  name: string;
  realm: string;
  realmSlug: string;
  className: string | null;
  specName: string | null;
  faction: string | null;
  profilePicUrl: string | null;
}

export function WaitingCharacters() {
  const [characters, setCharacters] = useState<WaitingCharacter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stream = new EventSource(`${API_URL}/api/characters/waiting/stream`, {
      withCredentials: true,
    });

    const handleData = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { characters?: WaitingCharacter[] };
        if (Array.isArray(payload.characters)) {
          setCharacters(payload.characters);
          setLoading(false);
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

  if (loading) {
    return (
      <section>
        <h2 className="text-2xl font-bold mb-6">Waiting To Be Processed</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-12 w-12 rounded-full mb-3" />
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  if (characters.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="text-2xl font-bold mb-6">Waiting To Be Processed</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {characters.map((char) => (
          <Link key={char.id} href={`/character/${char.realmSlug}/${char.name.toLowerCase()}`}>
            <Card className="transition-colors hover:bg-accent cursor-pointer">
              <CardContent className="p-4">
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
    </section>
  );
}
