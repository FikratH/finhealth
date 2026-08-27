// Mints the short-lived bearer token apps/api/app/auth.py verifies.
//
// Better Auth's own `jwt` plugin was evaluated first (per the task brief)
// and rejected: its `/token` endpoint always signs with an asymmetric
// keypair (EdDSA by default, or another JWKS-published algorithm) — there's
// no supported way to make it emit a plain HS256 token against a shared
// secret. The API's contract (apps/api/app/auth.py) is specifically
// `jwt.decode(token, AUTH_JWT_SECRET, algorithms=["HS256"], ...)`, a
// symmetric secret shared between the two apps, not a JWKS consumer — so
// this route signs the token itself with `jose` instead of going through
// that plugin.
//
// session-authenticated (Better Auth's own cookie), never the other way
// around: this route reads the session, then mints a *separate* token for
// the API to verify. The two systems never share a secret with each other
// (BETTER_AUTH_SECRET is Better Auth's own; AUTH_JWT_SECRET is the
// web<->api bridge) — a Better Auth session leaking would not hand out a
// valid API token, and vice versa.
import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { auth, authReady } from "@/lib/auth";

// Must match apps/api/app/auth.py's JWT_ISSUER/JWT_AUDIENCE exactly — see
// that file's own header comment for the shared contract.
const JWT_ISSUER = "tonus-web";
const JWT_AUDIENCE = "tonus-api";
const JWT_ALGORITHM = "HS256";
// Short-lived by design (Global Constraints): the client bridge
// (lib/api-token.ts) re-mints rather than caching long, so a stolen token
// has a small blast radius.
const TOKEN_TTL_SECONDS = 15 * 60;

export async function GET(request: Request) {
  await authReady();

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json(
      { code: "auth_required", message: "Требуется вход в систему." },
      { status: 401 },
    );
  }

  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    // Mirrors apps/api/app/auth.py's own stance: an unconfigured shared
    // secret means the bridge is off, not broken — a 200 with no token so
    // the client bridge's fallback (no Authorization header, same as
    // anonymous) is the only behavior a caller has to handle, alongside a
    // real 401. Never a 500: this is a deployment/config state, not a
    // server error.
    return NextResponse.json({ token: null });
  }

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setSubject(session.user.id)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({ token });
}
