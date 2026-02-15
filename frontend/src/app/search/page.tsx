"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import { getClassColor, getParseColor } from "@/lib/wow-constants";

interface SearchResult {
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
  bestParse: number | null;
  avgParse: number | null;
  currentMplusScore: number | null;
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const doSearch = useCallback(async (searchQuery: string, searchPage: number) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    try {
      const response = await api.api.characters.get({
        query: {
          search: searchQuery,
          page: searchPage.toString(),
          limit: "20",
        },
      });
      if (response.data && "characters" in response.data) {
        setResults(response.data.characters as SearchResult[]);
        setTotal((response.data as Record<string, unknown>).pagination ? (((response.data as Record<string, unknown>).pagination as Record<string, number>)?.total ?? 0) : 0);
      }
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQuery) {
      doSearch(initialQuery, 1);
    }
  }, [initialQuery, doSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    router.push(`/search?q=${encodeURIComponent(query)}`);
    doSearch(query, 1);
  };

  return (
    <div className="container max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Search Characters</h1>

      <form onSubmit={handleSearch} className="flex gap-2 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by character name, realm, or guild..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : results.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            {total} result{total !== 1 ? "s" : ""} found
          </p>
          <div className="space-y-3">
            {results.map((char) => (
              <Link key={char.id} href={`/character/${char.realmSlug}/${char.name.toLowerCase()}`}>
                <Card className="transition-colors hover:bg-accent cursor-pointer">
                  <CardContent className="p-4 flex items-center gap-4">
                    {char.profilePicUrl ? (
                      <Image src={char.profilePicUrl} alt={char.name} width={48} height={48} unoptimized className="h-12 w-12 rounded-full border border-border" />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-lg font-bold">{char.name[0]}</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold" style={{ color: getClassColor(char.className) }}>
                        {char.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {char.realm} · {char.className ?? "Unknown"} {char.specName ? `(${char.specName})` : ""}
                        {char.guild && ` · <${char.guild}>`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {char.bestParse !== null && (
                        <Badge variant="outline" style={{ color: getParseColor(char.bestParse), borderColor: getParseColor(char.bestParse) }}>
                          Best: {char.bestParse.toFixed(0)}
                        </Badge>
                      )}
                      {char.currentMplusScore !== null && char.currentMplusScore > 0 && <Badge variant="outline">M+ {char.currentMplusScore.toFixed(0)}</Badge>}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          {total > 20 && (
            <div className="flex justify-center gap-2 mt-6">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => {
                  const newPage = page - 1;
                  setPage(newPage);
                  doSearch(query, newPage);
                }}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={page * 20 >= total}
                onClick={() => {
                  const newPage = page + 1;
                  setPage(newPage);
                  doSearch(query, newPage);
                }}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : initialQuery ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">No characters found matching &quot;{initialQuery}&quot;</CardContent>
        </Card>
      ) : null}
    </div>
  );
}
