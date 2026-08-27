// Better Auth's own catch-all route (session, magic-link send/verify,
// Google OAuth redirect/callback, sign-out, ...). `authReady()` is awaited
// before every request reaches it — the very first request against a fresh
// .data/auth.db (a new dev checkout, or an e2e run's isolated DB) must not
// race Better Auth's own schema migration.
import { auth, authReady } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handler = toNextJsHandler(auth);

export async function GET(request: Request) {
  await authReady();
  return handler.GET(request);
}

export async function POST(request: Request) {
  await authReady();
  return handler.POST(request);
}
