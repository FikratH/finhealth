"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useLocale, useTranslations } from "next-intl";
import { SectionHeading } from "@/components/section-heading";
import { InstrumentModule } from "@/components/instrument-module";
import { SegmentDisplay } from "@/components/segment-display";
import { getPrefersReducedMotion, scanlineSweep } from "@/lib/motion";
import type { Locale } from "@/lib/format";

// Registered once per module load, guarded the same way
// motion-provider.tsx/results-document.tsx register it — gsap.registerPlugin
// is idempotent, but re-checking a module-level flag matches the
// established pattern rather than trusting MotionProvider's own app-wide
// registration to have already run before this component's own effect.
let scrollTriggerRegistered = false;
function registerScrollTriggerOnce() {
  if (scrollTriggerRegistered) return;
  gsap.registerPlugin(useGSAP, ScrollTrigger);
  scrollTriggerRegistered = true;
}

const STEPS = ["stepOne", "stepTwo", "stepThree"] as const;

// Each row's own instrument reading is its position in the protocol (01/02/
// 03), not a fabricated metric — the sequence itself is real information
// (upload before verify before diagnose), so the number is earned, not
// decorative (design-direction's own "eight-cell truth": no invented
// figures, ever, including here).
export function HowItWorks() {
  const t = useTranslations("Landing.howItWorks");
  const locale = useLocale() as Locale;
  const scope = useRef<HTMLOListElement>(null);

  useGSAP(
    () => {
      registerScrollTriggerOnce();
      if (getPrefersReducedMotion()) return;

      const root = scope.current;
      if (!root) return;

      const rows = gsap.utils.toArray<HTMLElement>("[data-scanline-row]", root);
      rows.forEach((row) => {
        ScrollTrigger.create({
          trigger: row,
          start: "top 80%",
          once: true,
          onEnter: () => scanlineSweep(row),
        });
      });
    },
    { scope, dependencies: [] },
  );

  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <SectionHeading>{t("heading")}</SectionHeading>
      <ol ref={scope} className="mt-8 grid gap-6 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step} data-scanline-row className="relative overflow-hidden">
            {/* scanlineSweep translates this full-width line by ±100% of
             * its OWN width (xPercent) to sweep fully off-screen on each
             * side — a transformed box, which contributes to scrollable
             * overflow regardless of its parent's visual bounds unless
             * that parent clips it. overflow-hidden on this li (not just
             * a visual nicety) is what stops the rightmost column's sweep
             * from transiently widening document.documentElement.scrollWidth
             * mid-animation. */}
            <span
              data-scanline
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-full opacity-0 bg-[linear-gradient(90deg,transparent,var(--accent)_45%,var(--accent)_55%,transparent)]"
            />
            <div data-scanline-content className="space-y-3">
              <h3 className="font-display text-xl text-ink">{t(`${step}Title`)}</h3>
              <InstrumentModule
                label={t("stepLabel")}
                figure={<SegmentDisplay value={index + 1} digits={2} locale={locale} />}
              >
                <p className="text-sm text-ink-muted">{t(`${step}Body`)}</p>
              </InstrumentModule>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
