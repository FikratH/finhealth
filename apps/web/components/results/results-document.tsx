"use client";

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { SectionHeading } from "@/components/section-heading";
import { ScoreHeader } from "./score-header";
import { CategoryScores } from "./category-scores";
import { RatioSection } from "./ratio-section";
import { RiskRadar } from "./risk-radar";
import { WhatIfSimulator } from "./what-if-simulator";
import { StrengthsRisks } from "./strengths-risks";
import { Recommendations } from "./recommendations";
import { AnalystNarrative } from "./analyst-narrative";
import { WarningsAccordion } from "./warnings-accordion";
import { MissingMetricsHint } from "./missing-metrics-hint";
import { Footnotes } from "./footnotes";
import { ShareButton } from "./share-button";
import { RevealSection } from "./reveal-section";
import { MiniNav, type MiniNavItem } from "./mini-nav";
import { buildFootnoteIndex } from "@/lib/results";
import { simulationMatchesBaseline } from "@/lib/simulator";
import { MOTION, getPrefersReducedMotion } from "@/lib/motion";
import type { AnalysisResult } from "@/lib/api-types";
import type { Locale } from "@/lib/format";

export interface ResultsDocumentProps {
  analysis: AnalysisResult;
  locale: Locale;
}

// Registered once per module load (guarded, same pattern as
// motion-provider.tsx's registerScrollTriggerOnce) rather than at module
// scope directly: gsap.registerPlugin(ScrollTrigger) touches
// window.matchMedia internally, so it must run only on the client, inside
// this component's effect — never during SSR of this "use client" module.
let scrollTriggerRegistered = false;
function registerScrollTriggerOnce() {
  if (scrollTriggerRegistered) return;
  gsap.registerPlugin(useGSAP, ScrollTrigger);
  scrollTriggerRegistered = true;
}

// Reveal a section once it's most of the way into view — early enough to
// feel anticipatory, not so early it fires while the section is still
// mostly off-screen.
const SECTION_REVEAL_START = "top 75%";

// The diagnosis document: one continuous page the score header, category
// bars, ratio sections, risk radar, and prescriptions all belong to — not
// a dashboard of separately-scrolling cards. This is also the results
// page's one client boundary for motion: every ScrollTrigger the scroll
// cinema creates is created here, scoped to `scope`, and killed by
// useGSAP's own cleanup on unmount (gsap-react's context.revert()) — no
// child component (RevealSection, NormBand, ScoreDial) owns any animation
// of its own; they only carry the data-* hooks this component's useGSAP
// queries and drives.
export function ResultsDocument({ analysis, locale }: ResultsDocumentProps) {
  const tRatios = useTranslations("Results.ratios");
  const tDisclaimer = useTranslations("Results.disclaimer");
  const tNav = useTranslations("Results.nav");
  const tCategories = useTranslations("Results.categories");
  const tRiskRadar = useTranslations("Results.riskRadar");
  const tWhatIf = useTranslations("Results.whatIf");
  const tRecommendations = useTranslations("Results.recommendations");
  const tNarrative = useTranslations("Results.narrative");
  // Memoized, not recomputed every render: both scan the full ratios list
  // (buildFootnoteIndex) or re-run the TS simulator engine
  // (simulationMatchesBaseline) — real work this component has no reason
  // to redo on renders that don't touch `analysis` (e.g. the narrative
  // state changes below).
  const footnoteIndex = useMemo(() => buildFootnoteIndex(analysis.ratios), [analysis.ratios]);
  const whatIfMatchesBaseline = useMemo(
    () => simulationMatchesBaseline(analysis),
    [analysis],
  );

  const scope = useRef<HTMLDivElement>(null);
  const hasStrengthsOrRisks = analysis.strengths.length > 0 || analysis.risks.length > 0;
  const hasRecommendations = analysis.recommendations.length > 0;

  // The заключение opening (score arc draw + verdict stamp) is a load
  // moment, not a per-effect-run one — this survives across the useGSAP
  // re-syncs `narrativeAvailable`/`narrativeHasContent` trigger below (see
  // that hook's own comment) so a narrative state change never replays it.
  const hasPlayedOpeningRef = useRef(false);

  // Seeded to the document's own top (the заключение is always what's on
  // screen at load) — "always-lit" means something is current from the
  // first frame, never a blank nav waiting for the first scroll.
  const [activeId, setActiveId] = useState<string | null>("score");

  // Mirrors AnalystNarrative's own hidden state one level up so its
  // section entry below (RevealSection's hairline rule + mini-nav anchor)
  // disappears along with it once a 503 confirms no LLM key is configured
  // — a designed-absence 503 leaves nothing behind, not even empty chrome.
  const [narrativeAvailable, setNarrativeAvailable] = useState(true);

  // Whether the narrative section is currently more than a bare button —
  // seeded from the payload's own cached narrative, flipped once by
  // AnalystNarrative's onGenerated after a successful client-side
  // generate. Drives this section's print visibility (a button-only
  // narrative prints nothing, same as the what-if simulator) and, via the
  // useGSAP dependency array below, forces a scroll-cinema re-sync when the
  // document's height actually changes.
  const [narrativeHasContent, setNarrativeHasContent] = useState(
    Boolean(analysis.narrative),
  );

  // The single source both the RevealSection JSX below and the mini-nav's
  // items derive from — a section named here, once, either exists in both
  // places or neither; there is no second list to fall out of sync with.
  // `id`/`navLabel` are only set on sections worth a mini-nav anchor
  // (warnings, missing-metrics, footnotes, and the disclaimer still get a
  // scroll reveal — they just don't get an anchor or a DOM id).
  const sections: {
    key: string;
    id?: string;
    navLabel?: string;
    className?: string;
    show: boolean;
    content: ReactNode;
    /** See RevealSection's own prop doc — hides the section's hairline
     * rule on print too, not just its (already print:hidden) content. */
    printHidden?: boolean;
  }[] = [
    {
      key: "categories",
      id: "categories",
      navLabel: tCategories("heading"),
      show: true,
      content: <CategoryScores categories={analysis.category_scores} locale={locale} />,
    },
    {
      key: "ratios",
      id: "ratios",
      navLabel: tRatios("heading"),
      className: "space-y-6",
      show: true,
      content: (
        <>
          <SectionHeading>{tRatios("heading")}</SectionHeading>
          {analysis.category_scores.map((category) => (
            <RatioSection
              key={category.category}
              category={category}
              ratios={analysis.ratios.filter((ratio) => ratio.category === category.category)}
              locale={locale}
              footnoteIndex={footnoteIndex}
              sourceValues={analysis.source_values ?? []}
            />
          ))}
        </>
      ),
    },
    {
      key: "risk-radar",
      id: "risk-radar",
      navLabel: tRiskRadar("heading"),
      show: Boolean(analysis.risk_radar),
      content: analysis.risk_radar ? (
        <RiskRadar riskRadar={analysis.risk_radar} locale={locale} />
      ) : null,
    },
    {
      key: "what-if",
      id: "what-if",
      navLabel: tWhatIf("heading"),
      // The simulator needs the analysis's own raw source_values to have
      // anything to scale — absent on payloads stored before that field
      // existed (same optionality as the provenance trace). It also only
      // shows when the TS engine's zero-lever recompute actually
      // reproduces the stored overall_score (see lib/simulator's
      // `simulationMatchesBaseline`) — always true for a real analysis,
      // and the guard that keeps a stale/inconsistent payload from
      // presenting a "changed ratios" list that was never comparing like
      // with like.
      show: (analysis.source_values?.length ?? 0) > 0 && whatIfMatchesBaseline,
      content: <WhatIfSimulator analysis={analysis} locale={locale} />,
      // WhatIfSimulator's own <section> is unconditionally print:hidden
      // (a live slider readout means nothing on paper) — without this, its
      // RevealSection wrapper would still print a hairline rule over
      // nothing.
      printHidden: true,
    },
    {
      key: "strengths-risks",
      id: "strengths-risks",
      navLabel: tNav("strengthsRisks"),
      show: hasStrengthsOrRisks,
      content: <StrengthsRisks strengths={analysis.strengths} risks={analysis.risks} />,
    },
    {
      key: "recommendations",
      id: "recommendations",
      navLabel: tRecommendations("heading"),
      show: hasRecommendations,
      content: (
        <Recommendations recommendations={analysis.recommendations} locale={locale} />
      ),
    },
    {
      key: "narrative",
      id: "narrative",
      navLabel: tNarrative("heading"),
      show: narrativeAvailable,
      content: (
        <AnalystNarrative
          analysis={analysis}
          locale={locale}
          onUnavailable={() => setNarrativeAvailable(false)}
          onGenerated={() => setNarrativeHasContent(true)}
        />
      ),
      // print:hidden while this is still just a button (AnalystNarrative's
      // own idle-state <section> is already print:hidden — this keeps its
      // RevealSection wrapper's hairline rule from printing above nothing
      // too); once real prose exists, the section prints like any other.
      printHidden: !narrativeHasContent,
    },
    {
      key: "warnings",
      show: analysis.warnings.length > 0,
      content: <WarningsAccordion warnings={analysis.warnings} />,
    },
    {
      key: "missing-metrics",
      // The insufficient-data state's guidance panel (in ScoreHeader)
      // already lists these same missing_metrics — skip the duplicate.
      show: analysis.overall_score !== null && analysis.missing_metrics.length > 0,
      content: <MissingMetricsHint missingMetrics={analysis.missing_metrics} />,
    },
    {
      key: "footnotes",
      show: footnoteIndex.size > 0,
      content: <Footnotes sources={footnoteIndex} />,
    },
    {
      key: "disclaimer",
      show: true,
      content: (
        <section className="border-2 border-ink p-6">
          <h2 className="font-display text-xl text-ink">{tDisclaimer("heading")}</h2>
          <p className="mt-2 text-sm text-ink-muted">{analysis.disclaimer}</p>
        </section>
      ),
    },
  ];

  const visibleSections = sections.filter((section) => section.show);

  const navItems: MiniNavItem[] = [
    { id: "score", label: tNav("score") },
    ...visibleSections
      .filter((section) => section.id && section.navLabel)
      .map((section) => ({ id: section.id!, label: section.navLabel! })),
  ];

  useGSAP(
    () => {
      registerScrollTriggerOnce();
      // The reduced-motion gate: read fresh here (not via the reactive
      // usePrefersReducedMotion hook) so it's honored on this very first
      // run. Returning early means zero gsap.set/gsap.timeline/ScrollTrigger
      // calls ever happen — every element stays exactly as rendered (fully
      // visible, ScoreDial's arc already at its final data-filled value),
      // and the mini-nav still works via its plain <a href="#id"> anchors.
      if (getPrefersReducedMotion()) return;

      const root = scope.current;
      if (!root) return;

      // (1) The заключение opening — on load, not scroll: the score arc
      // draws, then the verdict stamp "applies" (scale 1.06→1 + opacity,
      // no bounce), once per mount. `dependencies` below re-syncs this
      // whole effect (revert + re-run) whenever the narrative section's
      // availability or content changes, so this branch guards against
      // *replaying* that load-only animation on those later runs —
      // `hasPlayedOpeningRef` only flips once, and every re-run past the
      // first jumps the arc/stamp straight to their finished state instead
      // of animating from 0/scale 1.06 again.
      const arc = root.querySelector<SVGCircleElement>("[data-score-arc]");
      const stamp = root.querySelector<HTMLElement>("[data-verdict-stamp]");

      if (!hasPlayedOpeningRef.current) {
        hasPlayedOpeningRef.current = true;
        const openingTl = gsap.timeline();

        if (arc) {
          // ScoreDial always renders its *final* dasharray (data-filled is
          // that same target, in the same pathLength=100 units) — a plain
          // numeric proxy tweened via onUpdate draws it from 0, rather than
          // relying on GSAP to interpolate the two-number dasharray string
          // directly.
          const target = Number(arc.dataset.filled ?? "0");
          const proxy = { filled: 0 };
          openingTl.fromTo(
            proxy,
            { filled: 0 },
            {
              filled: target,
              duration: MOTION.reveal,
              ease: MOTION.ease,
              onUpdate: () => {
                arc.setAttribute("stroke-dasharray", `${proxy.filled} ${100 - proxy.filled}`);
              },
            },
            0,
          );
        }

        if (stamp) {
          openingTl.fromTo(
            stamp,
            { scale: 1.06, opacity: 0 },
            { scale: 1, opacity: 1, duration: MOTION.base, ease: MOTION.ease },
            arc ? ">" : 0,
          );
        }
      } else {
        if (arc) {
          const target = Number(arc.dataset.filled ?? "0");
          arc.setAttribute("stroke-dasharray", `${target} ${100 - target}`);
        }
        if (stamp) gsap.set(stamp, { scale: 1, opacity: 1 });
      }

      // (2) + (3) + (4): exactly one ScrollTrigger per section — the
      // hairline draws (scaleX 0→1), the content fades up 12px, any
      // NormBand flags inside it ink in alongside (150ms), and the
      // mini-nav's active id updates on every crossing in either
      // direction — all off the same trigger, never a second one.
      // toggleActions "play none none none" makes the reveal itself
      // trigger-once (it never reverses on scroll-back) without killing
      // the trigger, so onEnterBack can keep tracking nav state for the
      // rest of the session.
      const sectionElements = gsap.utils.toArray<HTMLElement>("[data-reveal-section]", root);
      sectionElements.forEach((sectionEl) => {
        const rule = sectionEl.querySelector<HTMLElement>("[data-reveal-rule]");
        const content = sectionEl.querySelector<HTMLElement>("[data-reveal-content]");
        const flags = sectionEl.querySelectorAll<HTMLElement>("[data-normband-flag]");
        if (!content) return;

        gsap.set(content, { opacity: 0, y: 12 });
        if (rule) gsap.set(rule, { scaleX: 0 });
        if (flags.length) gsap.set(flags, { opacity: 0 });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: sectionEl,
            start: SECTION_REVEAL_START,
            toggleActions: "play none none none",
            // Sections without a mini-nav id (warnings, missing-metrics,
            // footnotes, the disclaimer) still reveal — they just never
            // touch nav state, so scrolling past them can't blank out the
            // last real anchor the reader passed.
            onEnter: () => sectionEl.id && setActiveId(sectionEl.id),
            onEnterBack: () => sectionEl.id && setActiveId(sectionEl.id),
          },
        });
        if (rule) tl.to(rule, { scaleX: 1, duration: MOTION.reveal, ease: MOTION.ease }, 0);
        tl.to(content, { opacity: 1, y: 0, duration: MOTION.reveal, ease: MOTION.ease }, 0);
        if (flags.length) {
          tl.to(
            flags,
            { opacity: 1, duration: MOTION.fast, ease: MOTION.ease },
            MOTION.reveal * 0.5,
          );
        }
      });

      // Web fonts (STIX Two Text, PT Mono) can finish loading after this
      // effect has already measured every trigger's position against the
      // fallback stack's metrics — refresh once they're actually ready so
      // a font-driven reflow can't leave a trigger's start point stale.
      // Optional-chained: jsdom has no FontFaceSet at all (document.fonts
      // is undefined there), and this is a pure enhancement either way.
      document.fonts?.ready.then(() => ScrollTrigger.refresh());
    },
    {
      scope,
      // Re-syncs (revert + re-run) whenever the narrative section's own
      // presence or size changes — a 503 removes it entirely, a
      // successful generate grows it — either of which shifts every
      // section below it and would otherwise leave those sections'
      // ScrollTriggers computed against the old layout (F1, fix-wave
      // round 4): a doc-end section's onEnter could then never fire
      // because the trigger still expects the pre-change scroll position.
      dependencies: [narrativeAvailable, narrativeHasContent],
      revertOnUpdate: true,
    },
  );

  return (
    <div ref={scope}>
      <MiniNav items={navItems} activeId={activeId} />

      <div className="mx-auto max-w-5xl space-y-10 px-6 py-10">
        <div className="flex justify-end">
          <ShareButton />
        </div>

        <ScoreHeader analysis={analysis} locale={locale} id="score" />

        {visibleSections.map((section) => (
          <RevealSection
            key={section.key}
            id={section.id}
            className={section.className}
            printHidden={section.printHidden}
          >
            {section.content}
          </RevealSection>
        ))}
      </div>
    </div>
  );
}
