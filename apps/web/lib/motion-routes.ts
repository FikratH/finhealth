// Shared between components/motion-provider.tsx (the real, gsap/lenis-
// importing provider) and components/motion-provider-lazy.tsx (the
// route-gating seam that decides whether to reach for it at all). Kept in
// its own zero-dependency file rather than re-exported from motion-
// provider.tsx: importing that module for just this constant would pull
// its top-level gsap/ScrollTrigger/lenis imports into whatever chunk asks
// for it, defeating the point of the lazy wrapper checking this *before*
// deciding to import the real provider.
//
// Matches both the ru (no prefix) and en ("/en" prefix) forms of
// /results/[id] under next-intl's "as-needed" locale prefix.
export const RESULTS_ROUTE_SEGMENT = "/results/";
