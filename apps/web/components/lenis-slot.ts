import type Lenis from "lenis";

// Shared between components/motion-provider.tsx (the real provider, which
// writes here) and components/results/mini-nav.tsx (which only ever reads
// here) — split into its own zero-dependency module so mini-nav's static
// import no longer drags gsap/ScrollTrigger/lenis's full weight into the
// results route's own synchronous chunk (P6 T4's known remaining gap: the
// provider was compiling in twice, once via this static edge and once via
// motion-provider-lazy.tsx's next/dynamic() chunk, ~10.3 kB gzip of
// redundant code). `import type` above is erased at compile time — a
// TypeScript type-only import emits no JS — so this module has no runtime
// dependency on the `lenis` package at all, matching lib/motion-routes.ts's
// own zero-dependency discipline (and, like that module, no "use client"
// directive — moot either way here, since both of this module's importers
// (motion-provider.tsx, mini-nav.tsx) are themselves client modules, so no
// Server Component ever crosses this boundary; The Server-Boundary
// Constants Rule, DESIGN.md, is about a Server Component silently
// receiving a client *reference* for a shared string constant, a failure
// mode that can't arise when nothing server-side ever imports this file).
let activeLenis: Lenis | null = null;

/** Called only by motion-provider.tsx: records (or clears) the Lenis
 * instance it's currently driving. */
export function setLenis(instance: Lenis | null): void {
  activeLenis = instance;
}

/**
 * The Lenis instance MotionProvider is currently driving, or `null` when
 * none exists (non-results routes, reduced motion, or before its effect has
 * run). mini-nav.tsx's click-to-navigate reads this to decide whether to
 * trigger a smooth scroll or fall back to the native anchor jump.
 */
export function getLenis(): Lenis | null {
  return activeLenis;
}
