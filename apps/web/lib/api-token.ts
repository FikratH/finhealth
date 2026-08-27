// Client-side bridge between a Better Auth session and the API's bearer
// token — the only thing lib/api.ts's tokenProvider registration ever
// calls. Fetches /auth/token (session-authenticated via the browser's
// own cookie, no arguments needed) and caches the result in memory until
// shortly before it expires, so a burst of API calls (e.g. upload →
// extract → analyze in quick succession) doesn't re-mint a token per call.
let cached: { token: string; exp: number } | null = null;

// Refetch this many seconds before actual expiry — cheap insurance against
// a token going stale mid-request on a slow connection.
const REFRESH_SKEW_SECONDS = 30;

/** Reads the unverified `exp` claim out of a JWT's own payload — safe here
 * because this token was just minted for this browser by our own server;
 * nothing downstream trusts this decode for authorization, only for cache
 * timing. Returns null on any malformed input rather than throwing, so a
 * decode hiccup degrades to "always refetch" instead of breaking auth. */
function decodeExp(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(normalized)) as { exp?: unknown };
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

/** Returns a signed API bearer token for the current Better Auth session,
 * or null when there is none (anonymous, expired, or the API bridge isn't
 * configured server-side — see app/auth/token/route.ts). Never throws:
 * every failure mode collapses to "no token," matching lib/api.ts's
 * anonymous-by-default posture. */
export async function getApiToken(): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - REFRESH_SKEW_SECONDS > now) {
    return cached.token;
  }

  try {
    // Deliberately NOT under /api/* — see lib/auth.ts's basePath comment
    // for why (a collision with next.config.ts's backend-proxy rewrite).
    const response = await fetch("/auth/token", { credentials: "include" });
    if (!response.ok) {
      cached = null;
      return null;
    }
    const data = (await response.json()) as { token: string | null };
    if (!data.token) {
      cached = null;
      return null;
    }
    const exp = decodeExp(data.token) ?? now + 60; // conservative fallback TTL
    cached = { token: data.token, exp };
    return data.token;
  } catch {
    cached = null;
    return null;
  }
}

/** Test/sign-out hook — clears the in-memory cache so a stale token from a
 * previous session can never survive past sign-out. */
export function clearCachedApiToken(): void {
  cached = null;
}
