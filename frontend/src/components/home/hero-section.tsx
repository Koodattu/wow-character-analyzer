"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function HeroSection() {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/search?q=${encodeURIComponent(search.trim())}`);
    }
  };

  return (
    <section className="relative overflow-hidden border-b border-border/40 bg-linear-to-b from-background to-muted/20">
      <div className="container mx-auto max-w-screen-2xl px-4 py-16 md:py-24">
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="flex items-center gap-3">
            <Shield className="h-12 w-12 text-primary" />
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">WoW Character Analyzer</h1>
          </div>
          <p className="max-w-2xl text-lg text-muted-foreground md:text-xl">
            Deep-dive into any World of Warcraft character&apos;s raid and M+ performance. AI-powered insights from WarcraftLogs, Raider.IO, and Blizzard API data.
          </p>

          <form onSubmit={handleSearch} className="flex w-full max-w-md gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search character name, realm, or guild..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button type="submit">Search</Button>
          </form>

          <p className="text-sm text-muted-foreground">Try searching for a character name or realm to get started</p>
        </div>
      </div>
    </section>
  );
}
