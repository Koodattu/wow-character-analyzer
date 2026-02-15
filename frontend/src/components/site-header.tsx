"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Shield, LogIn, User, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export function SiteHeader() {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center px-4">
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <Shield className="h-6 w-6 text-primary" />
          <span className="hidden font-bold sm:inline-block">WoW Analyzer</span>
        </Link>

        <nav className="flex items-center gap-4 text-sm lg:gap-6">
          <Link
            href="/search"
            className={cn("flex items-center gap-1.5 transition-colors hover:text-foreground/80", pathname === "/search" ? "text-foreground" : "text-foreground/60")}
          >
            <Search className="h-4 w-4" />
            Search
          </Link>
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2">
          {isLoading ? null : user ? (
            <>
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">{user.username ?? "Dashboard"}</span>
                </Button>
              </Link>
              {user.isAdmin && (
                <Link href="/admin">
                  <Button variant="ghost" size="sm" className="gap-1.5">
                    <Settings className="h-4 w-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </Button>
                </Link>
              )}
            </>
          ) : (
            <Link href="/login">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <LogIn className="h-4 w-4" />
                Login
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
