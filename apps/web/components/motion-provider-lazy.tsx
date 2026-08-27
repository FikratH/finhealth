"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { RESULTS_ROUTE_SEGMENT } from "@/lib/motion-routes";

// The seam: components/motion-provider.tsx (the real provider) statically
// imports gsap, gsap/ScrollTrigger, and lenis — the entire reason the
// motion runtime used to ship on every route's first-load JS, including
// ones with no motion of their own (signin, /my, methodology). Per Next's
// own lazy-loading guide, a next/dynamic() call only produces a genuinely
// separate, on-demand chunk when it's made from client-executed code, not
// when a Server Component reaches for it directly — so this tiny client
// wrapper is what app/[locale]/layout.tsx (a Server Component) imports
// normally and synchronously, and *this* file is the one that calls
// dynamic(). Default `ssr` (true): on the routes that do reach for it, the
// real MotionProvider still renders during SSR rather than waiting for a
// client-only mount.
const MotionProviderImpl = dynamic(() =>
  import("@/components/motion-provider").then((mod) => mod.MotionProvider),
);

// round-1 fix (review-t4-verdict.md, Finding 1/2/3): merely wrapping the
// import in dynamic() was not enough. next/dynamic's default ssr:true still
// server-renders a <PreloadChunks> element that emits a <link rel=preload>
// for every motion chunk into EVERY route's HTML the instant this
// component is even reachable in the tree — so signin/my/methodology were
// still downloading the full 50.9kB gzip (just at low fetchPriority), and
// with no `loading` prop the dynamic element has no Suspense boundary of
// its own (loadable.js: hasSuspenseBoundary = !ssr || !!loading), so those
// bytes gated hydration of the whole app subtree regardless.
//
// The actual fix: never render MotionProviderImpl at all outside
// /results/* — nothing there needs it. motion-provider.tsx's own Lenis
// construction already early-returns off that route, and its
// registerScrollTriggerOnce() is redundant: every ScrollTrigger consumer
// (landing/how-it-works.tsx, landing/logo-reveal.tsx,
// results/what-if-simulator.tsx, results/results-document.tsx)
// self-registers the plugin. So gating here isn't losing anything — it's
// just no longer paying for gsap/lenis/ScrollTrigger's PreloadChunks *or*
// their hydration gate on routes that were never going to use them.
//
// round-2 fix (review-t4-verdict.md, Finding 7): `needsMotion` used to
// choose between two different element TYPES at `children`'s own tree
// position — `<>{children}</>` vs `<MotionProviderImpl>{children}</...>` —
// and React remounts everything at a position when the type there changes.
// Every results↔non-results client navigation was therefore unmounting and
// remounting the entire app shell (AuthBootstrap, SiteHeader, main,
// SiteFooter), not just this provider — including AuthBootstrap's own
// useSession()-driven effect, a plausible source of a cleared API token
// mid-navigation on an authenticated path. Fixed by making the provider an
// effects-only SIBLING instead of a wrapper: `children` now sits at a
// fixed position in the returned fragment regardless of `needsMotion`, so
// only the *provider's own* presence toggles, never anything around it.
export function MotionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const needsMotion = pathname?.includes(RESULTS_ROUTE_SEGMENT) ?? false;

  return (
    <>
      {needsMotion && <MotionProviderImpl />}
      {children}
    </>
  );
}
