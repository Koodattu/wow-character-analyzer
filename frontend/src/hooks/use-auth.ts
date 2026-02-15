"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

interface LinkedProviders {
  discord: boolean;
  battlenet: boolean;
}

interface User {
  id: string;
  username: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  linkedProviders: LinkedProviders;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const response = await api.api.auth.me.get();
      if (response.data && "user" in response.data && response.data.user) {
        setUser(response.data.user as User);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = async () => {
    try {
      await api.api.auth.logout.post();
      setUser(null);
      window.location.href = "/";
    } catch {
      // Ignore
    }
  };

  const unlinkProvider = async (provider: "discord" | "battlenet") => {
    try {
      const response = await (api.api.auth.unlink as unknown as Record<string, { post: () => Promise<{ data: Record<string, unknown> | null }> }>)[provider].post();
      if (response.data && "success" in response.data) {
        // Refresh user data to get updated linked providers
        await fetchUser();
        return { success: true };
      }
      const errorMsg = response.data && "error" in response.data ? String(response.data.error) : "Failed to unlink";
      return { success: false, error: errorMsg };
    } catch {
      return { success: false, error: "Failed to unlink provider" };
    }
  };

  return { user, isLoading, logout, unlinkProvider, refetchUser: fetchUser };
}
