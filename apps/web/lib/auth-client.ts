// Better Auth browser client. No `baseURL` — the auth route handler lives
// in this same Next.js app (app/auth/[...all]/route.ts), so same-origin
// relative requests just work, in dev and in every deployment. `basePath`
// must match lib/auth.ts's server-side config exactly (see that file's own
// comment on why it's "/auth", not Better Auth's "/api/auth" default).
"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  basePath: "/auth",
  plugins: [magicLinkClient()],
});

export const useSession = authClient.useSession;
