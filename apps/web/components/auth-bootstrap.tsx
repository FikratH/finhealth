"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { getApiToken, clearCachedApiToken } from "@/lib/api-token";
import { setTokenProvider } from "@/lib/api";

// Mounted once in app/[locale]/layout.tsx, renders nothing. The only job
// here is registering/clearing lib/api.ts's tokenProvider as the Better
// Auth session comes and goes — kept out of lib/api.ts itself so that
// module never has to import React or Better Auth (see its own comment).
export function AuthBootstrap() {
  const { data: session } = useSession();

  useEffect(() => {
    if (session) {
      setTokenProvider(getApiToken);
    } else {
      setTokenProvider(null);
      clearCachedApiToken();
    }
  }, [session]);

  return null;
}
