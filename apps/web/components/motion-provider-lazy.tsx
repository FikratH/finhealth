"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// The seam: components/motion-provider.tsx (the real provider) statically
// imports gsap, gsap/ScrollTrigger, and lenis — the entire reason the
// motion runtime used to ship on every route's first-load JS, including
// ones with no motion of their own (signin, /my, methodology). Per Next's
// own lazy-loading guide, a next/dynamic() call only produces a genuinely
// separate, on-demand chunk when it's made from client-executed code, not
// when a Server Component reaches for it directly — so this tiny client
// wrapper is what app/[locale]/layout.tsx (a Server Component) imports
// normally and synchronously, and *this* file is the one that calls
// dynamic(). Default `ssr` (true): the real MotionProvider still renders
// during SSR, so `children` is never missing from the initial HTML.
const MotionProviderImpl = dynamic(() =>
  import("@/components/motion-provider").then((mod) => mod.MotionProvider),
);

export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionProviderImpl>{children}</MotionProviderImpl>;
}
