import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except for /api, /auth, /_next, /_vercel, and files
  // with a dot. /auth (Better Auth's own basePath — lib/auth.ts) must not
  // get a locale prefix injected the way a real page route would.
  matcher: "/((?!api|auth|_next|_vercel|.*\\..*).*)",
};
