"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface User {
  id: string;
  username: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      try {
        const response = await api.api.auth.me.get();
        if (response.data && "user" in response.data && response.data.user) {
          setUser(response.data.user as User);
        }
      } catch {
        // Not authenticated
      } finally {
        setIsLoading(false);
      }
    }
    fetchUser();
  }, []);

  const logout = async () => {
    try {
      await api.api.auth.logout.post();
      setUser(null);
      window.location.href = "/";
    } catch {
      // Ignore
    }
  };

  return { user, isLoading, logout };
}
