"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { SegmentDisplay, type SegmentDisplayHandle, type SegmentDisplayProps } from "@/components/segment-display";

export type PriceFigureProps = SegmentDisplayProps;

// Pricing's one authored moment (finish-wave material_fix 3): each price
// figure ignites its own boot-grammar cascade the instant it mounts — one
// digit MOTION.step after the previous, via SegmentDisplay's own
// imperative ignite() handle — rather than rendering pre-lit and inert.
// useGSAP (not a plain useEffect) runs the ignition before paint, the
// same layout-timed discipline every other ignition call site in the app
// follows (see lib/motion.ts's igniteSequence doc comment: it avoids a
// visible flash of the pre-rendered final state). No ScrollTrigger
// registration needed — this is a page-load moment, not a scroll-linked
// one, so there's nothing beyond useGSAP's own lightweight context/
// cleanup to set up (unlike landing/how-it-works.tsx's self-registering
// pattern, which exists specifically for its ScrollTrigger use).
//
// Reduced motion: SegmentDisplay.ignite() calls igniteSequence(), whose
// own reduced-motion branch sets every segment lit synchronously and
// returns null — no timeline, "instruments simply already on."
//
// This is the first client-side motion import on /pricing (round-0/1/2
// shipped it with zero) — the deliberate cost of the authored moment: the
// route now pulls in gsap + @gsap/react on its own, same as how the
// motion runtime already ships on any route reaching for these hooks
// directly rather than through the route-gated MotionProvider (see
// motion-provider-lazy.tsx's own header comment on why THAT gate exists —
// it protects the far heavier gsap+ScrollTrigger+lenis bundle
// MotionProvider pulls in for the results scroll cinema, which this page
// never touches).
export function PriceFigure(props: PriceFigureProps) {
  const ref = useRef<SegmentDisplayHandle>(null);

  useGSAP(() => {
    ref.current?.ignite();
  }, []);

  return <SegmentDisplay ref={ref} {...props} />;
}
