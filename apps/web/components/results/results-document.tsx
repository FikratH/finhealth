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
import { MOTION, getPrefersReducedMotion, igniteSequence, scanlineSweep } from "@/lib/motion";
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
// mostly off-screen. Kept as one fraction, not two independent magic
// numbers: SECTION_REVEAL_START (the string ScrollTrigger's own `start`
// option parses) and revealAlreadyInView's own geometry check both derive
// from it, so they can't silently drift apart.
const SECTION_REVEAL_START_FRACTION = 0.75;
const SECTION_REVEAL_START = `top ${SECTION_REVEAL_START_FRACTION * 100}%`;

/** Whether a section should be treated as already revealed on THIS
 * useGSAP run, rather than hidden-and-animated — true if either its own
 * key was already marked revealed on a prior run (survives a
 * revertOnUpdate re-sync via the caller's `revealedKeys` ref, the same
 * pattern as `hasPlayedOpeningRef`), or it's *currently* sitting at or
 * above its own reveal activation point (mirrors SECTION_REVEAL_START:
 * the section's own top has already crossed 75% down the viewport).
 *
 * The second condition is what a layout shift (the narrative section
 * collapsing on a 503, or growing after a successful generate) can newly
 * create: a section that used to sit below the fold can end up already
 * on screen the moment the effect re-runs, with no scroll in between.
 * Re-creating a ScrollTrigger from that section's hidden (data-scanline-
 * hidden) state would replay its scanline sweep — via ScrollTrigger's own
 * documented "fire immediately if already past start" behavior — for
 * content the reader never saw hide in the first place: a visible
 * hide-then-reappear flicker with no user-facing cause (fix-wave round 3,
 * F1 completion).
 *
 * A pure, DOM-reading predicate — no GSAP/ScrollTrigger calls of its own
 * — so it's unit-testable without a real ScrollTrigger instance.
 */
export function revealAlreadyInView(
  sectionEl: HTMLElement,
  revealedKeys: ReadonlySet<string>,
  viewportHeight: number,
): boolean {
  const key = sectionEl.dataset.sectionKey;
  if (key && revealedKeys.has(key)) return true;
  return sectionEl.getBoundingClientRect().top <= viewportHeight * SECTION_REVEAL_START_FRACTION;
}

// The diagnosis document: one continuous page the score header, category
// bars, ratio sections, risk radar, and prescriptions all belong to — not
// a dashboard of separately-scrolling cards. This is also the results
// page's one client boundary for motion: every ScrollTrigger the scroll
// cinema creates is created here, scoped to `scope`, and killed by
// useGSAP's own cleanup on unmount (gsap-react's context.revert()) — no
// child component (RevealSection, SegmentDisplay, AnnunciatorCell) owns
// any animation of its own; they only carry the data-* hooks this
// component's useGSAP queries and drives.
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
  // Additive (Phase 7 Task 5): drives Footnotes' single, honest "KZ
  // coverage is partial" note — computed once here rather than re-scanning
  // per render inside Footnotes itself.
  const hasKzOverlay = useMemo(
    () => analysis.ratios.some((r) => r.benchmark_kz != null),
    [analysis.ratios],
  );
  const whatIfMatchesBaseline = useMemo(
    () => simulationMatchesBaseline(analysis),
    [analysis],
  );

  const scope = useRef<HTMLDivElement>(null);
  const hasStrengthsOrRisks = analysis.strengths.length > 0 || analysis.risks.length > 0;
  const hasRecommendations = analysis.recommendations.length > 0;

  // The заключение opening (score ignition + verdict stamp) is a load
  // moment, not a per-effect-run one — this survives across the useGSAP
  // re-syncs `narrativeAvailable`/`narrativeHasContent` trigger below (see
  // that hook's own comment) so a narrative state change never replays it.
  const hasPlayedOpeningRef = useRef(false);

  // Section keys (RevealSection's `data-section-key`, not the optional
  // nav `id`) that have already revealed — survives a revertOnUpdate
  // re-sync the same way hasPlayedOpeningRef does. Read by
  // revealAlreadyInView so a re-sync instant-settles a section that's
  // already revealed instead of hiding and re-animating it (see that
  // function's own comment for the flicker this prevents).
  const revealedSectionKeysRef = useRef<Set<string>>(new Set());

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
      content: <Footnotes sources={footnoteIndex} hasKzOverlay={hasKzOverlay} />,
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
      // run. Returning early means zero gsap.set/igniteSequence/
      // scanlineSweep/ScrollTrigger calls ever happen — every element
      // stays exactly as rendered (fully visible, the score's segments
      // already lit), and the mini-nav still works via its plain
      // <a href="#id"> anchors.
      if (getPrefersReducedMotion()) return;

      const root = scope.current;
      if (!root) return;

      // (1) The заключение opening — on load, not scroll: the score
      // SegmentDisplay ignites (its own boot-grammar cascade, MOTION.step
      // apart per segment), then the verdict AnnunciatorCell "applies"
      // (scale 1.06→1 + opacity, no bounce) a fixed beat later — the same
      // one-two rhythm the old arc-then-stamp opening had, once per mount.
      // `dependencies` below re-syncs this whole effect (revert + re-run)
      // whenever the narrative section's availability or content changes,
      // so this branch guards against *replaying* that load-only
      // animation on those later runs — `hasPlayedOpeningRef` only flips
      // once, and every re-run past the first jumps the stamp straight to
      // its finished state instead of animating from scale 1.06 again (the
      // score's segments, once lit by igniteSequence, simply stay lit —
      // there's nothing left to force on a re-sync).
      const scoreDisplay = root.querySelector<HTMLElement>("[data-score-display]");
      const stamp = root.querySelector<HTMLElement>("[data-verdict-stamp]");

      // Captured before hasPlayedOpeningRef flips below — true only from
      // the second run onward (a narrative-state re-sync), never on the
      // original mount. Gates revealAlreadyInView's instant-settle path
      // in the section sweep further down: the deliberate load-time
      // "even above-the-fold content ignites in" cinema effect stays
      // exactly as designed on mount, and only a re-sync gets the
      // flicker-avoiding shortcut.
      const isResync = hasPlayedOpeningRef.current;

      if (!hasPlayedOpeningRef.current) {
        hasPlayedOpeningRef.current = true;

        // A client-side route transition (analyze → results) can leave
        // window.scrollY carrying over the *previous* page's scroll
        // offset for a brief window before Next.js's own scroll-to-top
        // takes effect — this mount effect can run inside that window,
        // ahead of Next's own reset. Since the заключение is always what
        // a fresh diagnosis document opens on, force the reset ourselves
        // rather than depending on that ordering: without it, every
        // section whose position happened to sit within the stale
        // scrolled-past viewport would fire its ScrollTrigger immediately
        // (correctly, per "even above-the-fold content ignites in" — but
        // against the wrong, leftover scroll position), stealing "score"'s
        // always-lit nav default before the reader has scrolled this
        // document at all. Narrowly scoped to exactly that case: skipped
        // when the URL carries its own hash (a direct deep link wins
        // instead), and skipped on a reload or a back/forward navigation
        // of *this* page — both restore a scroll position *deliberately*
        // (the share-link reader who reloads mid-scroll, or navigates back
        // into this page, should land exactly where they were), so this
        // reset must never fight that restoration.
        //
        // PerformanceNavigationTiming describes how the *document* was
        // loaded, not how this route was reached — under Next's App
        // Router, a client-side transition (e.g. /analyze → /results/[id])
        // never creates a new navigation entry at all, so after a reload
        // of /analyze, the soft nav into this results page would still see
        // type "reload" here even though *this* page was never reloaded.
        // `navEntry.name` (the URL that entry's own load resolved to) is
        // what distinguishes the two: it only matches window.location.href
        // when this exact page — not an earlier one in the same SPA
        // session — was the one actually reloaded or restored.
        const navEntry = performance.getEntriesByType("navigation")[0] as
          | PerformanceNavigationTiming
          | undefined;
        const isRestoredNavigation =
          navEntry != null &&
          (navEntry.type === "reload" || navEntry.type === "back_forward") &&
          navEntry.name === window.location.href;
        if (!window.location.hash && !isRestoredNavigation && window.scrollY > 0) {
          window.scrollTo(0, 0);
        }

        // The score ignites first; the verdict stamp lights strictly
        // *after* it finishes — the same one-two rhythm the old
        // arc-then-stamp opening had, now derived from the ignition
        // cascade's own (data-dependent) duration rather than a fixed
        // guess, so a wider reading (more lit segments, a longer cascade)
        // never lands the stamp mid-ignition.
        const igniteTl = scoreDisplay ? igniteSequence(scoreDisplay, "[data-segment-on]") : null;

        // The заключение block's own LED bar-graph cells (ConfidenceMeter)
        // cascade alongside the score — scoped to "#score" only, so this
        // never touches a not-yet-revealed section's LedBar cells further
        // down the document (those cascade on their own scanline sweep
        // below instead, "where a reveal already animates").
        // :not(details ...) for the same reason the section-level call
        // below excludes it: the confidence-disclosure's own meters sit
        // inside a closed <details> here too (ConfidenceDisclosure, right
        // next to the header's main meter) — nothing sees them until a
        // reader opens that disclosure, so they don't belong in this
        // load-time cascade either (verdict remainder, W2).
        const scoreHeaderEl = root.querySelector<HTMLElement>("#score");
        if (scoreHeaderEl) {
          igniteSequence(scoreHeaderEl, "[data-cell-on]:not(details [data-cell-on])");
        }

        if (stamp) {
          gsap.timeline().fromTo(
            stamp,
            { scale: 1.06, opacity: 0 },
            { scale: 1, opacity: 1, duration: MOTION.base, ease: MOTION.ease },
            igniteTl ? igniteTl.duration() : 0,
          );
        }
      } else {
        if (stamp) gsap.set(stamp, { scale: 1, opacity: 1 });

        // Untracked restore (verdict remainder, W1): igniteSequence's
        // mount-time cascades above are gsap-*tracked* tl.set() calls,
        // built inside this same useGSAP callback — so a later dependency
        // change (narrativeAvailable/narrativeHasContent, this effect's
        // own `dependencies`) reverts them via revertOnUpdate's
        // context.revert() before this re-run, rolling every "data-lit"
        // attribute it touched back to the "false" igniteSequence itself
        // set immediately before building the timeline. Nothing else ever
        // repairs it — React's vDOM already holds "true" for those nodes,
        // so a later render never re-writes an attribute it thinks is
        // unchanged. Plain (untracked) setAttribute calls here, exactly
        // like the flicker-safe scanline machinery already uses, aren't
        // subject to that revert and are the same instant-settle idiom
        // this branch already applies to the stamp above. Pre-existing
        // since R4 for the score digits alone (6a74ccf's tracked
        // ignition under this same revertOnUpdate effect) — this wave's
        // #score LedBar cells widened the fault, and fixing it here
        // closes both halves at once.
        scoreDisplay
          ?.querySelectorAll<HTMLElement>("[data-segment-on]")
          .forEach((el) => el.setAttribute("data-lit", "true"));
        root
          .querySelector<HTMLElement>("#score")
          ?.querySelectorAll<HTMLElement>("[data-cell-on]")
          .forEach((el) => el.setAttribute("data-lit", "true"));
      }

      // (2) + (3): exactly one ScrollTrigger per section — the boot
      // grammar's section-entry verb (design-direction: "scanline sweep +
      // ignition per section"): lib/motion's scanlineSweep sweeps one thin
      // teal beam across the section (a genuine tween — the beam's own
      // travel is continuous) while its content pops in instantly behind
      // it ("every change is an instant segment swap" — no fade/y tween on
      // the content itself), and the mini-nav's active id updates on every
      // crossing in either direction — all off the same trigger, never a
      // second one. A section is only ever swept once (tracked via a plain
      // `swept` DOM flag on the section itself, since scanlineSweep always
      // replays its own beam-travel tween from scratch on every call,
      // unlike the old fade/y timeline which naturally no-opped on a
      // repeat "play" once already complete) — re-entering after scrolling
      // back up just re-tracks nav state, never re-sweeps.
      //
      // ScrollTrigger fires onEnter for any trigger whose start point the
      // page is already past — synchronously at create() time, and again
      // whenever a `resize` event drives its own auto-refresh (which
      // page.setViewportSize's real resize event exercises in the e2e
      // suite, not just the initial mount). A compact instrument header
      // can leave a section like "categories" already within the
      // viewport, so this can fire before the reader has scrolled at all
      // — correct for the sweep itself (above-the-fold content should
      // still ignite immediately), wrong for nav state (it would silently
      // steal "score"'s own always-lit default). `hasScrolled()` — a
      // real, live scroll-position read, not a one-shot flag captured at
      // setup time — distinguishes the two: any callback firing while the
      // page is still at its top can only be one of these synthetic
      // already-past fires, never a genuine crossing (reaching a second
      // section's activation point by scrolling requires having actually
      // scrolled away from y=0 first).
      function hasScrolled() {
        return window.scrollY > 0;
      }

      const sectionElements = gsap.utils.toArray<HTMLElement>("[data-reveal-section]", root);
      sectionElements.forEach((sectionEl) => {
        const content = sectionEl.querySelectorAll<HTMLElement>("[data-scanline-content]");
        if (!content.length) return;

        const sectionKey = sectionEl.dataset.sectionKey;
        const alreadyInView =
          isResync &&
          revealAlreadyInView(sectionEl, revealedSectionKeysRef.current, window.innerHeight);

        if (alreadyInView) {
          // The flicker-avoiding sweep: instant-settle to the finished
          // state (no beam travel, content already lit) and attach a
          // plain, animation-free ScrollTrigger — nav-highlight tracking
          // only, nothing left to reveal. See revealAlreadyInView's own
          // comment for why this exists.
          if (sectionKey) revealedSectionKeysRef.current.add(sectionKey);
          sectionEl.dataset.swept = "true";
          content.forEach((el) => el.removeAttribute("data-scanline-hidden"));

          ScrollTrigger.create({
            trigger: sectionEl,
            start: SECTION_REVEAL_START,
            onEnter: () => hasScrolled() && sectionEl.id && setActiveId(sectionEl.id),
            onEnterBack: () => hasScrolled() && sectionEl.id && setActiveId(sectionEl.id),
          });
          return;
        }

        content.forEach((el) => el.setAttribute("data-scanline-hidden", "true"));

        ScrollTrigger.create({
          trigger: sectionEl,
          start: SECTION_REVEAL_START,
          onEnter: () => {
            if (!sectionEl.dataset.swept) {
              sectionEl.dataset.swept = "true";
              scanlineSweep(sectionEl);
              // Any LED bar-graph cells this section reveals right now
              // (category score bars) cascade in the same moment as its
              // scanline sweep — "cells light in sequence via the boot
              // grammar where a reveal already animates" (finish review,
              // material_fixes 2). Excludes cells inside a <details> (a
              // ratio's own provenance ConfidenceMeter): those aren't part
              // of this reveal at all — nothing sees them until a reader
              // opens that disclosure, at which point they're already at
              // their default lit state, same as every other primitive's
              // no-JS/reduced-motion baseline.
              igniteSequence(sectionEl, "[data-cell-on]:not(details [data-cell-on])");
            }
            // Sections without a mini-nav id (warnings, missing-metrics,
            // footnotes, the disclaimer) still reveal — they just never
            // touch nav state, so scrolling past them can't blank out the
            // last real anchor the reader passed. Guarded by
            // hasScrolled() (see above) so a section already in view at
            // setup/refresh time can't steal "score"'s always-lit
            // default.
            if (hasScrolled() && sectionEl.id) setActiveId(sectionEl.id);
            // Recorded regardless of run number — by the time any later
            // re-sync happens, this marks the section revealed for
            // revealAlreadyInView's ref check above, even if a subsequent
            // layout shift moves it back off-screen.
            if (sectionKey) revealedSectionKeysRef.current.add(sectionKey);
          },
          onEnterBack: () => hasScrolled() && sectionEl.id && setActiveId(sectionEl.id),
        });
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
      // ScrollTriggers computed against the old layout (Phase 4 final
      // review, F1): a doc-end section's onEnter could then never fire
      // because the trigger still expects the pre-change scroll
      // position. revealAlreadyInView above is this same fix's round-3
      // completion — the re-sync itself must not flicker already-visible
      // sections while it rebuilds everything else.
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
            sectionKey={section.key}
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
