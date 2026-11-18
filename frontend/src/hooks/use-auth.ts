"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, unwrapOrNull } from "@/lib/api";

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

interface AuthMeResponse {
  user: User | null;
}

interface UnlinkResponse {
  success?: boolean;
  error?: string;
}

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(() => api.api.auth.me.get()
    .then(unwrapOrNull<AuthMeResponse>)
    .then((data) => setUser(data?.user ?? null))
    .catch(() => setUser(null))
    .finally(() => setIsLoading(false)), []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = async () => {
    try {
      await api.api.auth.logout.post();
      setUser(null);
      router.push("/");
      router.refresh();
    } catch {
      // Ignore
    }
  };

  const unlinkProvider = async (provider: "discord" | "battlenet") => {
    try {
      const response = await api.api.auth.unlink({ provider }).post();
      const data = unwrapOrNull<UnlinkResponse>(response);
      if (data?.success) {
        await fetchUser();
        return { success: true };
      }
      return { success: false, error: data?.error ?? "Failed to unlink" };
    } catch {
      return { success: false, error: "Failed to unlink provider" };
    }
  };

  return { user, isLoading, logout, unlinkProvider, refetchUser: fetchUser };
}
