---
name: Tonus
description: A company's financial diagnosis rendered as a modern laboratory results document.
colors:
  paper: "#FBFAF7"
  ink: "#1A1D1C"
  ink-muted: "#5A605D"
  line: "#E3E1DA"
  grid: "rgba(14, 117, 105, 0.06)"
  accent: "#0E7569"
  good: "#177E4D"
  attention: "#96601A"
  critical: "#B23B2E"
typography:
  display:
    fontFamily: "STIX Two Text, Georgia, serif"
    fontWeight: 400
  body:
    fontFamily: "Inter, sans-serif"
    fontWeight: 400
  label:
    fontFamily: "PT Mono, monospace"
    fontWeight: 400
rounded:
  sm: "0.3rem"
  md: "0.4rem"
  lg: "0.5rem"
  xl: "0.7rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    rounded: "{rounded.lg}"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
  chip-specimen:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-muted}"
    rounded: "0"
---

# Design System: Tonus

## Overview

**Creative North Star: "The Lab Report"**

Tonus renders a company's bloodwork literally: every surface is a modern laboratory results document, not a fintech dashboard wearing a stethoscope. An SMB owner who cannot confidently read financial statements reads their diagnosis the way they'd read a clinic printout — reference intervals with out-of-range flags, specimen-label chips, a stamped verdict, hairline document structure. The world is built and named in `.superpowers/sdd/2026-08-27-plan-3-frontend-foundation/design-direction.md` (THESIS/OWN-WORLD/STORY/FIRST VIEWPORT/FORM), embedded verbatim as an HTML comment at the top of every page's `<body>` via `components/direction-contract.tsx` — the contract is load-bearing documentation, not a stray artifact.

The system is committed at region scale, not sprinkled: the clinical teal owns the landing hero's full-bleed header band and the score reveal; everywhere else it is rare. Shadows are absent by design — document structure (hairline rules, borders, typographic hierarchy) carries layout the way a printed page does, never a shadowed card. Nulls and "insufficient data" are composed states with their own guidance, never blank space or a silently-suppressed 0.

**Phase 4 (the diagnosis experience) turned the results document into a scroll cinema without touching any of the above.** `results-document.tsx` now reveals its sections one hairline-and-fade at a time as the reader scrolls, on a single "one metronome" timing system (`lib/motion.ts`); the document also grew a live what-if simulator, an optional LLM analyst narrative, an interactive provenance trace on every sourced figure, and a public methodology page — all built as extensions of the existing document grammar (SpecimenChip, StatusPill, grid-paper, hairline rules), never a second visual language. **Reduced motion means the fully static, finished document** — every GSAP/ScrollTrigger call is skipped outright (not just disabled mid-flight) when `prefers-reduced-motion: reduce` is set, and the document renders every section already revealed.

**Key Characteristics:**
- Reference-interval grammar: value, then its норма-band in bracket notation, with ▲/▼ out-of-range flags always paired with text
- Specimen-label chips for industry/period/currency/confidence metadata
- Grid-paper (faint millimeter grid) grounds under chart/score surfaces, never flat cards
- A stamped, rule-framed conclusion block (the «заключение») for the health verdict
- Zero shadows; 1px hairline borders; generous paper margins
- A one-metronome scroll cinema (`lib/motion.ts` + `motion-provider.tsx`): each document section reveals once, in scroll order, never replayed
- Every extracted figure traces to one of three honest provenance states — sourced, derived, or not-found — never a silent blank
- A designed-absence philosophy for optional features (the AI narrative collapses to nothing, not an error, when unconfigured)

## Colors

A restrained, near-monochrome paper-and-ink palette with one committed accent and a status triad that is always paired with a symbol, never color-alone.

### Primary
- **Clinical Teal** (`#0E7569`, dark: `#2FA394`): the one committed accent. Carries the landing hero's full-width header band, the score dial's filled arc, primary actions (buttons, links, focus rings), and active step states. Deployed at region scale (a whole band, a whole arc) rather than as scattered chips — the "spot-ink discipline" raise: teal has exactly one job, structure.

### Neutral
- **Paper** (`#FBFAF7`, dark: `#111413`): the document ground. `--background`, card, popover, and select surfaces all resolve to it — there are no separate "elevated" surface tones.
- **Ink** (`#1A1D1C`, dark: `#E9E7E2`): primary text and structural borders (the stamp frame, the score-header outer rule).
- **Ink Muted** (`#5A605D`, dark: `#9AA19D`): secondary text, reference-interval captions, muted/reference-only figures.
- **Line** (`#E3E1DA`, dark: `#2A2E2C`): hairline rule color for every border, divider, and unfilled track (progress bars, meters).
- **Grid** (`rgba(14, 117, 105, 0.06)`, dark: `rgba(47, 163, 148, 0.08)`): the sub-2%-opacity ink used only by the `.grid-paper` utility.

### Status Triad (lab flags)
- **Good** (`#177E4D`, dark: `#3FAE76`): "✓" — status pill dot/text/glyph for a passing metric.
- **Attention** (`#96601A`, dark: `#C98A3A`): "▲" — status pill and NormBand flag for a borderline metric. Deliberately shifted from the direction contract's originally specified `#A8681C` (~4.32:1 contrast on `--paper`, below WCAG AA's 4.5:1 for normal text) to `#96601A` (~5.05:1); the dark-mode value was unaffected and needed no change. **The build's contrast-corrected value is normative; the direction contract's `#A8681C` is superseded.**
- **Critical** (`#B23B2E`, dark: `#D1655A`): "✕" — status pill and NormBand flag for a failing metric, and the sole `--destructive` mapping (form validation errors, e.g. ValueInput's invalid state).

### Named Rules
**The Lab-Flag Rule.** Every status signal pairs a color with a shape and a text label — a StatusPill is never a bare colored dot, and a NormBand's ▲/▼ flag always carries a visually-hidden text pairing (`aboveLabel`/`belowLabel`). This is deliberate for colorblind readers and for print, where color often doesn't survive.

**The One-Ink Rule.** Teal (`--accent`) is the only decorative color in the system. It never appears as a background fill outside the hero band, buttons, active-step indicators, and score/progress fills — it does not tint chips, borders, or body chrome.

**The Accent-Surface Trap.** `bg-accent`/`text-accent`/`border-accent` are shadcn's *semantic* accent-role utilities — in `app/globals.css` they resolve through `--color-accent: var(--accent-surface)`, a pale `color-mix(in oklch, var(--accent) 10%, var(--paper))` wash (14% in dark mode), not the committed teal. The real Clinical Teal is only reachable via `text-brand`/`border-brand`/`bg-brand` (`--color-brand: var(--accent)`) or a raw `var(--accent)`/`var(--primary)`. This is a naming trap, not a design choice — `bg-accent` *sounds* like "the brand color" and silently renders the wrong one. Every component that means the real teal (`SpecimenChip`'s `accent` tone, `StepIndicator`, `site-header.tsx`, landing hero, `ratio-row.tsx`'s manually-edited chip, `confidence-meter.tsx`'s bar fill, `WhatIfSimulator`'s slider thumb) reaches for `-brand`, never `-accent`. The wash's one legitimate use is stock shadcn/Radix internal state styling inherited as-is (`components/ui/select.tsx`'s `focus:bg-accent` highlighted-item background) — never something Tonus's own components reach for on purpose. Grep for a new `bg-accent`/`text-accent`/`border-accent` before assuming it's teal — outside a Radix primitive's own default, it almost certainly renders the wash by mistake.

## Typography

**Display Font:** STIX Two Text (with Georgia, serif fallback)
**Body Font:** Inter (with system sans-serif fallback)
**Label/Mono Font:** PT Mono (with monospace fallback)

**Character:** A scientific-publishing serif for headings and the verdict stamp, paired with a plain UI sans for body copy and a Cyrillic-first monospace for every number, chip, and reference interval — the pairing reads as an instrument report, not a marketing page. All three ship via `next/font` with `latin` + `cyrillic` subsets and `display: swap` (`app/[locale]/layout.tsx`); PT Mono is fixed at weight 400 (its only shipped weight).

### Hierarchy
- **Display** (STIX Two Text, `text-4xl`–`text-5xl` on the hero h1, `text-xl`–`text-2xl` on `SectionHeading` level 2 and the verdict stamp): section headings, page-level headlines, the stamped health-label verdict.
- **Body** (Inter, default text size): paragraph copy, ratio explanations, disclaimers.
- **Label/Figures** (PT Mono, `text-xs`–`text-lg`, `tabular-nums`): every rendered number (`MetricNumber`, `NormBand`, `ScoreDial`, `ConfidenceMeter`), every specimen chip, status pill text, form input values, footnote markers, and the step indicator. `formatNumber()` (`lib/format.ts`) is the single source every one of these numbers passes through.

### Named Rules
**The All-Numbers-In-Mono Rule.** Any figure a user reads as data — a score, a ratio value, a percentage, a chip label — renders in PT Mono with `tabular-nums`. Prose and headings never do.

## Layout

Content is measure-constrained to `max-w-5xl` with `mx-auto` and horizontal `px-6` padding on nearly every route-level container (`site-header.tsx`, `landing-hero.tsx`'s inner content, `results-document.tsx`, `verify` surfaces) — this is the one recurring container width in the system. The landing hero is the deliberate exception: the `<section className="bg-brand">` itself is full-bleed (no `mx-auto` on the section), because the design-direction's "commit at region scale" rule requires the accent band to run edge-to-edge; only its *inner* header row and content grid are measure-constrained.

Vertical rhythm on document-like pages (`results-document.tsx`) uses `space-y-10` between major sections and `space-y-4`–`space-y-6` within them. Two-column layouts collapse to a single column below `md` (hero: `md:grid-cols-2`; score header: `sm:flex-row`).

The results document and the analyze flow are conceived as **one continuous document** (the "one-document continuity" raise): upload → verify → diagnosis is not a set of disconnected pages, and `analyze-flow.tsx` moves focus to each new step's root as the flow transitions, rather than resetting scroll/focus the way a page navigation would.

The methodology page (`components/methodology/methodology-document.tsx`) extends this continuity to the trust wedge: it reuses the same `max-w-5xl` measure, the same `SectionHeading` + `RevealSection` grammar, and the same `border-line`/`border-ink` rule-framed sections as the results document — but as a plain, static server component with zero client JS. `RevealSection` there is used only for its hairline-rule visual grammar, not its scroll-cinema `sectionKey` bookkeeping (that prop is left unset), so the page never registers with any ScrollTrigger.

## Elevation & Depth

The system is flat by design — zero shadows anywhere in `apps/web` (confirmed: no `box-shadow`/`shadow-*` utility is used on any surface; the only occurrences of the word "shadow" are code comments explaining its deliberate absence). Depth and grouping are conveyed entirely by hairline borders (`border-line`, 1px) and rule-framed sections (`border-2 border-ink` on the score header and disclaimer block), never by lifting a surface off the page. This directly encodes the design-direction's "Shadows ≈ 0; borders 1px; generous paper margins."

### Named Rules
**The No-Shadow Rule.** No component may use `box-shadow` or a Tailwind `shadow-*` utility for a resting or hovered state. Structure comes from borders and rules, exactly as in a printed document.

## Shapes

Radius is modest and mostly reserved for interactive controls: buttons and inputs carry `rounded-lg`/`rounded-sm`-scale corners (shadcn's `--radius: 0.5rem` base, scaled to `--radius-sm`/`md`/`lg`/`xl`), while document-grammar primitives — `SpecimenChip`, `StatusPill`, the verdict stamp, table/section borders — are square-cornered rectangles bordered in `border-line` or `border-ink`. The verdict stamp (`score-header.tsx`) is the one deliberately-broken rectangle: `border-4 border-double` at a `-rotate-[1.5deg]` tilt, reading as a hand-applied ink stamp rather than a UI card — no texture, gradient, or shadow reinforces the illusion, the tilt and double border do all the work.

## Components

### Buttons
- **Shape:** `rounded-lg` (default/lg sizes), smaller radii on `xs`/`sm` icon variants (shadcn `buttonVariants`, `components/ui/button.tsx`).
- **Primary (`default`):** `bg-primary` (teal) / `text-primary-foreground` (paper), `hover:bg-primary/80`. The hero's CTA inverts this locally to `bg-paper text-brand` so the button reads against the teal band rather than disappearing into it.
- **Outline / Secondary / Ghost / Destructive / Link:** shadcn variants restyled onto the project's tokens (`border-border`, `bg-secondary`, `text-destructive` mapped to `--critical`) — stock shadcn behavior, our palette, per the design-direction's "shadcn primitives as behavior, our skin" rule.
- **Focus:** `focus-visible:ring-3 focus-visible:ring-ring/50`; active press is a 1px `translate-y-px` nudge, not a scale or shadow change.

### Chips
- **SpecimenChip** (`components/specimen-chip.tsx`): the specimen-label idiom — small, bordered, uppercase, `font-mono text-xs`, `bg-paper`. Tones: `neutral` (`border-line`), `accent` (`border-brand`), `attention` (`border-attention`). Used for industry, period, currency, scale, «ДЕМО-ДАННЫЕ», and the money-ratio «справочно» (reference-only) marker.
- **StatusPill** (`components/status-pill.tsx`): pairs a colored dot + lab-flag glyph (✓/▲/✕/·) + translated label word inside a `border-line` pill — the glyph and label are the accessible signal, color is reinforcement only.

### Cards / Containers
- **Corner Style:** square (no radius) on document sections; `rounded-lg` only on interactive controls.
- **Background:** `--paper` uniformly; there is no separate "elevated card" background tone.
- **Border:** `border-line` (1px) for routine grouping; `border-2 border-ink` for the score header and disclaimer block, marking them as the document's load-bearing sections.
- **Internal Padding:** `p-6`/`p-8` (`sm:p-8`) on major sections; `px-6 py-10` on the outer document container.
- **Grid-paper ground:** the `.grid-paper` utility (`app/globals.css`) — two `repeating-linear-gradient`s at `var(--grid)`, 8px pitch — is applied to `ScoreDial`'s wrapper and the score header section, per the rule that "chart/score areas sit on a faint grid texture, never on flat cards."

### Inputs / Fields
- **Style:** `border border-line`, `bg-paper`, `font-mono text-sm tabular-nums` (`ValueInput`, `components/analyze/value-input.tsx`) — a numeric field reads as the document's own printed figure at rest (RU thin-space grouped) and reveals raw digits only while focused.
- **Focus:** `border-accent` + `ring-2 ring-ring/40`.
- **Error/Invalid:** `border-critical` with a `role="alert"` message below the field, in `text-critical`.
- **Select** (`components/ui/select.tsx`): same border/mono treatment, shadcn Radix behavior underneath.

### Navigation
- **StepIndicator** (`components/analyze/step-indicator.tsx`): the "always-lit you are here" raise — all three steps (Загрузка → Проверка → Диагноз) render at full legibility simultaneously; state is conveyed by a filled/outlined/muted circle plus color plus `aria-current="step"`, never by dimming inactive steps to near-invisibility.
- **SiteHeader:** a `border-b border-line bg-paper` header on every route except `/`, where it renders nothing — the landing hero composes its own header row inside the teal band so the page carries exactly one wordmark.

### The Заключение (Stamped Conclusion)
`components/results/score-header.tsx`'s verdict block: an "honest-ink seal, not simulated rubber" — a flat status-colored (`good`/`attention`/`critical`/`na`), uppercase, letter-spaced (`tracking-[0.2em]`), double-bordered, `-rotate-[1.5deg]` stamp around the `health_label` text. Tone is derived from `overall_score` mirroring the API's own tiering (`<45` critical, `<65` attention, else good; `null` renders neutral `na`, never a status color, because insufficient data isn't a verdict). No eyebrow/kicker sits above it — `SectionHeading` and the stamp both rely on the heading/border carrying its own weight, per the craft floor's ban on kickers.

### Scroll Cinema (Motion System)
`lib/motion.ts` is the "one metronome": a single `MOTION` object (`fast: 0.15`, `base: 0.2`, `reveal: 0.6`, `ease: "power2.out"`) that every GSAP/Lenis tween in the app draws its duration and ease from — no component defines its own tween timing. `getPrefersReducedMotion()`/`usePrefersReducedMotion()` (a `useSyncExternalStore` around `matchMedia`) is the single reduced-motion source both the imperative gate (read fresh, synchronously, inside an effect) and reactive rendering use.

`components/motion-provider.tsx` is the scroll layer: it registers `ScrollTrigger` once for the whole app, and — only on `/results/*` and only when reduced motion is off — constructs a `Lenis` smooth scroller wired into `gsap.ticker` (Lenis's official ScrollTrigger integration; `gsap.ticker.lagSmoothing(0)` while active, explicitly restored to GSAP's own defaults on cleanup so it never leaks into other routes). Every other route, and reduced motion on any route, gets native scroll — no Lenis instance is ever constructed. `getLenis()` exposes the live instance (or `null`) for the mini-nav's click-to-navigate, which falls back to a plain anchor jump when it's `null`.

`results-document.tsx`'s own `useGSAP` is the **only** place any ScrollTrigger for the diagnosis document is created — no child component (`RevealSection`, `NormBand`, `ScoreDial`) owns an animation of its own; they only carry `data-*` hooks this one effect queries and drives. The reveal grammar:
- **Trigger-once.** Each section gets exactly one `ScrollTrigger` (`toggleActions: "play none none none"`) that draws its hairline rule (`scaleX` 0→1), fades its content up 12px, and inks in any `NormBand` flags inside it — all off the same trigger, never a second one, and never reversed on scroll-back.
- **Imperative-set discipline.** The hidden "from" state is set via `gsap.set()` at effect time, never a render-time class — `RevealSection`'s content is always fully present and visible in the DOM (no-JS visitors, crawlers, and reduced-motion readers see the finished document with zero scroll dependency).
- **The заключение opening plays once per mount, not once per effect run.** `hasPlayedOpeningRef` gates the score-arc draw + verdict-stamp "apply" (scale 1.06→1 + opacity) so a later re-sync (see next point) jumps both straight to their finished state instead of replaying the load moment.
- **`revealAlreadyInView` resync sweep.** The whole `useGSAP` re-syncs (`revertOnUpdate: true`) whenever `narrativeAvailable`/`narrativeHasContent` changes — a 503 removes the narrative section, a successful generate grows it, either of which shifts every section below and would otherwise leave their triggers computed against stale layout. `revealAlreadyInView(sectionEl, revealedKeys, viewportHeight)` is the pure, DOM-reading predicate that decides whether a section instant-settles (already revealed, or already past its own reveal point) instead of hiding-then-refading — a section the reader already saw must never visibly flicker just because a re-sync ran.
- **The always-lit mini-nav.** `MiniNav` renders every section anchor at full legibility simultaneously (never dimmed dots revealing labels on hover) — the same "always-lit you are here" grammar as `StepIndicator`, reapplied to the scroll cinema. Desktop (`xl+`) gets a sticky right rail; below that, a top hairline progress bar reflects scroll position discretely (this app's scroll cinema has no continuous scroll-scrub).
- **The print override, as one aggregate rule.** `app/globals.css`'s `@media print` block forces `[data-reveal-content]`/`[data-reveal-rule]`/`[data-normband-flag]` to `opacity: 1 !important; transform: none !important;` — the one legitimate `!important` in the system, because it overrides GSAP's own inline styles, the one case render-time classes can't reach. It also force-opens every `<details>` (ratio detail, warnings accordion) so substitution strings aren't invisible on paper. Interactive-only chrome (`SiteHeader`, `SiteFooter`, `ShareButton`, both `MiniNav` renderings, the what-if simulator's whole section, an idle-state narrative button) is unconditionally `print:hidden`; `RevealSection`'s `printHidden` prop is what keeps that section's own hairline rule from printing above nothing once its content is hidden this way — three mechanisms (reveal override, chrome hiding, orphan-hairline suppression) that only add up to a correct printed document together.

### Named Rules (Motion)
**The One-Metronome Rule.** Every GSAP/Lenis tween draws its duration and ease from `MOTION` (`lib/motion.ts`) — no ad hoc `duration`/`ease` literal anywhere else in the scroll cinema. The mini-nav's top progress-bar fill is the one CSS transition still wired to it explicitly (`transitionDuration: ${MOTION.base * 1000}ms`) rather than a Tailwind `duration-*` class, so it can't drift from the metronome silently.

**The Duration-700 Meter-Idiom Family is a deliberate, separate exception — not a second metronome.** `ScoreDial`'s ghost arc, `ConfidenceMeter`'s fill, and `CategoryScores`' bars all animate on a plain Tailwind `transition-[width]`/`transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none` — 700ms, CSS `ease-out`, not GSAP's `power2.out`. These are **live-recompute fills that react to render-time prop changes** (a debounced what-if slider, a re-rendered category list), not scroll-triggered reveals — they have no `ScrollTrigger` and are gated by the plain CSS `motion-reduce:` variant rather than the JS `getPrefersReducedMotion()` gate. Do not fold them into `MOTION` or retime them to `MOTION.reveal` (600ms): the two families solve different problems (one-time scroll reveal vs. continuous live-value fill) and are allowed to disagree on both duration and easing curve. `MiniNav`'s own progress fill is the opposite case — it *is* wired to `MOTION.base`, because it's part of the scroll cinema's own state (see the One-Metronome Rule above), not a member of this family.

**The Reduced-Motion-Is-The-Document Rule.** When `getPrefersReducedMotion()` is true, `results-document.tsx`'s `useGSAP` returns before a single `gsap.set`/`gsap.timeline`/`ScrollTrigger` call — every element stays exactly as rendered (final score-arc value, all sections visible, mini-nav's plain `<a href="#id">` anchors still work). Reduced motion is not "the same cinema, faster" — it is the finished document, unconditionally.

### Provenance Trace
Every extracted figure resolves to exactly one of three states (`classifyProvenance`, `lib/results.ts`) — the three are deliberately visually distinct so they can never be mistaken for each other:
- **`sourced`** — a real value the document contained: shows a `ConfidenceMeter` (or a `SpecimenChip tone="accent"` «отредактировано вручную» chip if the analyst hand-edited it), the as-written original label, the source cell reference, and a truncated raw snippet (`SourcePopover`, `components/analyze/source-popover.tsx` — click the source marker to see the exact row/cell and raw text).
- **`derived`** — no `source_values` entry for this key at all: an average, subtotal, or conditionally-sourced figure computed from other sourced values (`working_capital`, `net_debt`, `free_cash_flow`, `enterprise_value`, the `average_*` inputs). Renders a bare `SpecimenChip` reading «расчётное значение» — no confidence meter, because nothing was extracted to have confidence about.
- **`not_found`** — `source_values` has an entry for this metric, but extraction found no value (`value: null`) — the dictionary looked and came up empty, a first-class null, never a fabricated reading. Renders a bare `SpecimenChip` reading «не найдено в документе».

`lib/metric-names.ts`'s `DERIVED_NAMES` supplies display names for the `derived` case's keys, which are never real `METRICS` entries and would otherwise fall back to a raw snake_case string; `ratioInputDisplayName()` checks `DERIVED_NAMES` first, then falls back to `metricDisplayName()`'s sourced-metric lookup.

### What-If Simulator
`components/results/what-if-simulator.tsx` — a deterministic, client-only «Что если?» panel: six sliders (`LeverSlider`, native `<input type="range">` for free keyboard support) scale their own metric, debounced 150ms, recomputed through `lib/simulator`, the same TS engine contract-tested against `apps/api`'s `ratios.py`/`scoring.py`. Grammar:
- **Ghost arc.** `ScoreDial`'s `ghostScore` prop draws a second, inset dashed arc beside the real score (`GHOST_RADIUS = 38` vs. the real arc's `RADIUS = 50`) — "beside it in depth," never a replacement, and never touched by the load-time GSAP opening (that only ever targets `data-score-arc`). It updates on every debounced recompute via the duration-700 meter-idiom family above.
- **Honesty captions are mandatory, not decorative.** A `SpecimenChip tone="attention"` reading «не сохраняется» sits beside the reset button, and a `text-xs text-ink-muted` disclosure line closes the panel — both are literal descriptions of the code (nothing here is ever sent to the server or persisted), not just reassuring copy.
- The whole section is unconditionally `print:hidden` — a live slider readout means nothing on paper — and only renders at all when `analysis.source_values` has entries and the TS engine's zero-lever recompute reproduces the stored `overall_score` (`simulationMatchesBaseline`), the guard against presenting a "changed ratios" list for a stale/inconsistent payload.

### Analyst Narrative
`components/results/analyst-narrative.tsx` — «Заключение аналитика», the one LLM layer in the document: prose *around* numbers everywhere else already computed (the API's prompt contract forbids it from computing or contradicting them). Three states:
- **Idle** — a bare `print:hidden` button («Сгенерировать»).
- **503 — designed absence.** No `OPENAI_API_KEY` configured server-side: the component returns `null` outright — no error banner, no retry prompt, no trace the feature was ever offered. `onUnavailable` bubbles this up so `results-document.tsx` drops the whole `RevealSection` wrapper too (`narrativeAvailable`), not just the inner content — a designed absence leaves nothing behind, not even an empty hairline rule.
- **Transient error (502/network/timeout) — the opposite of designed absence.** A visible `text-critical` error line appears and the generate button stays available to retry; cleared at the start of every new attempt so a second click's outcome is never shown alongside a stale message from the first.

**The AI-disclosure line is mandatory whenever narrative prose renders**, cached or freshly generated: `{t("disclosure")}` plus a `font-mono` `modelLabel`/`generatedAtLabel` line naming the model and timestamp — every LLM-authored paragraph in the document is labeled as such, permanently, never folded into the surrounding prose as if it were the document's own voice.

### Methodology Document
`components/methodology/methodology-document.tsx` is the trust wedge's public face — every formula, threshold, and source cited is read straight from `lib/methodology-data.json` (generated by `apps/api/scripts/export_methodology.py` from the real engine modules, never retyped by hand). A plain static server component, zero client JS, reusing the results document's own section grammar (`SectionHeading` + `RevealSection`'s hairline rule) without any of its scroll-cinema bookkeeping.

## Do's and Don'ts

### Do:
- **Do** put every user-facing number through `formatNumber()` (`lib/format.ts`) for RU thin-space grouping (`RU_GROUP_SEPARATOR`, a narrow no-break space, U+202F) or EN comma grouping, and PT Mono presentation.
- **Do** render `null` as a first-class, composed state: `overall_score: null` drives `ScoreHeader`'s dedicated insufficient-data guidance panel (missing-metrics list), and any `null` ratio value renders the domain-specific «Н/Д» via each component's own `naLabel` prop — never a bare `formatNumber` placeholder standing in for the real domain wording, and never `0`.
- **Do** derive a `NormBand`'s out-of-range flag color/visibility from the ratio's own API `status`, not from raw band position — pass `suppressFlag` when `status === "good"` so a higher-is-better ratio sitting above its "good" band doesn't show a contradicting red ▲ next to a green `StatusPill` (see `ratio-row.tsx`).
- **Do** render currency once, at the document/header level (`ScoreHeader`'s `SpecimenChip`), never repeated per figure — individual money-unit ratios show a muted value plus a «справочно» (reference-only) `SpecimenChip` instead of re-stating the currency.
- **Do** gate every non-essential CSS transition/animation with `motion-reduce:transition-none` or `motion-reduce:animate-none`, and keep content fully visible without JS or before any animation runs (the hero's `.hero-enter` opacity/transform lives only inside a `prefers-reduced-motion: no-preference` media query).
- **Do** force open `<details>` disclosures (ratio detail, warnings accordion) under `@media print` so substitution strings and explanations aren't invisible on a printed or screenshared report.
- **Do** draw every GSAP/Lenis tween's duration and ease from `MOTION` (`lib/motion.ts`) — a new scroll-triggered reveal never invents its own number.
- **Do** reach for `text-brand`/`border-brand`/`bg-brand` (or raw `var(--accent)`) when you mean the committed teal — `text-accent`/`border-accent`/`bg-accent` renders shadcn's pale `--accent-surface` wash instead (see The Accent-Surface Trap, above).
- **Do** classify every traced ratio input through `classifyProvenance()` (`sourced`/`derived`/`not_found`) rather than inferring provenance from whether a value happens to be non-null — a `derived` figure and a `not_found` null must never look alike.
- **Do** treat a narrative 503 as a designed absence (render nothing, drop the section chrome entirely) and any other narrative failure as transient (visible error line, retry stays available) — the two are not the same failure mode and must not share a UI state.

### Don't:
- **Don't** add a shadow (`box-shadow` or `shadow-*`) to any surface — depth comes from borders and rules only.
- **Don't** add an eyebrow/kicker above a heading or the verdict stamp — the craft floor bans the device outright; it is not available even as a one-off.
- **Don't** use color alone to signal status — every `StatusPill`/`NormBand` flag pairs its color with a glyph and a text label (visible or `sr-only`).
- **Don't** scatter the teal accent as decoration (tinted chip backgrounds, colored borders on routine content) — it is committed at region/component scale (hero band, score arc, primary actions) or not used.
- **Don't** treat `--attention`'s originally-specified `#A8681C` as current — the shipped, AA-compliant value is `#96601A`; do not revert it while chasing the direction contract's literal text.
- **Don't** give a scroll-revealed section a render-time hidden class — the "from" state is always `gsap.set()` at effect time, so no-JS/reduced-motion/print always see the finished document; a render-time class would show a permanently-hidden section to exactly those readers.
- **Don't** wrap a section that's already `print:hidden` inside (the what-if simulator, an idle-state narrative button) in a `RevealSection` without also passing `printHidden` — otherwise its hairline rule prints above nothing, an orphaned rule with no section beneath it.
- **Don't** retime the duration-700 meter-idiom family (`ScoreDial` ghost arc, `ConfidenceMeter`, `CategoryScores` bars) to `MOTION.reveal` or fold it into the metronome — it is a deliberate, separate CSS-only family for live-recompute fills, not a scroll reveal.
