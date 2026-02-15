"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getClassColor, getParseColor } from "@/lib/wow-constants";

interface FeaturedCharacter {
  id: string;
  name: string;
  realm: string;
  realmSlug: string;
  region: string;
  className: string | null;
  specName: string | null;
  faction: string | null;
  guild: string | null;
  profilePicUrl: string | null;
  bestParse: number | null;
  avgParse: number | null;
  currentMplusScore: number | null;
}

export function FeaturedCharacters() {
  const [characters, setCharacters] = useState<FeaturedCharacter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFeatured() {
      try {
        const response = await api.api.characters.featured.get();
        if (response.data && "characters" in response.data) {
          setCharacters(response.data.characters as FeaturedCharacter[]);
        }
      } catch {
        // API not available yet
      } finally {
        setLoading(false);
      }
    }
    fetchFeatured();
  }, []);

  if (loading) {
    return (
      <section>
        <h2 className="text-2xl font-bold mb-6">Recently Analyzed</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-12 w-12 rounded-full mb-3" />
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-3 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  if (characters.length === 0) {
    return (
      <section>
        <h2 className="text-2xl font-bold mb-6">Recently Analyzed</h2>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">No characters analyzed yet. Queue a character to get started!</CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-2xl font-bold mb-6">Recently Analyzed</h2>
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
    </section>
  );
}
