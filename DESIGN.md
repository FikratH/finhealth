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

**Key Characteristics:**
- Reference-interval grammar: value, then its норма-band in bracket notation, with ▲/▼ out-of-range flags always paired with text
- Specimen-label chips for industry/period/currency/confidence metadata
- Grid-paper (faint millimeter grid) grounds under chart/score surfaces, never flat cards
- A stamped, rule-framed conclusion block (the «заключение») for the health verdict
- Zero shadows; 1px hairline borders; generous paper margins

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

## Do's and Don'ts

### Do:
- **Do** put every user-facing number through `formatNumber()` (`lib/format.ts`) for RU thin-space grouping (`RU_GROUP_SEPARATOR`, a narrow no-break space, U+202F) or EN comma grouping, and PT Mono presentation.
- **Do** render `null` as a first-class, composed state: `overall_score: null` drives `ScoreHeader`'s dedicated insufficient-data guidance panel (missing-metrics list), and any `null` ratio value renders the domain-specific «Н/Д» via each component's own `naLabel` prop — never a bare `formatNumber` placeholder standing in for the real domain wording, and never `0`.
- **Do** derive a `NormBand`'s out-of-range flag color/visibility from the ratio's own API `status`, not from raw band position — pass `suppressFlag` when `status === "good"` so a higher-is-better ratio sitting above its "good" band doesn't show a contradicting red ▲ next to a green `StatusPill` (see `ratio-row.tsx`).
- **Do** render currency once, at the document/header level (`ScoreHeader`'s `SpecimenChip`), never repeated per figure — individual money-unit ratios show a muted value plus a «справочно» (reference-only) `SpecimenChip` instead of re-stating the currency.
- **Do** gate every non-essential CSS transition/animation with `motion-reduce:transition-none` or `motion-reduce:animate-none`, and keep content fully visible without JS or before any animation runs (the hero's `.hero-enter` opacity/transform lives only inside a `prefers-reduced-motion: no-preference` media query).
- **Do** force open `<details>` disclosures (ratio detail, warnings accordion) under `@media print` so substitution strings and explanations aren't invisible on a printed or screenshared report.

### Don't:
- **Don't** add a shadow (`box-shadow` or `shadow-*`) to any surface — depth comes from borders and rules only.
- **Don't** add an eyebrow/kicker above a heading or the verdict stamp — the craft floor bans the device outright; it is not available even as a one-off.
- **Don't** use color alone to signal status — every `StatusPill`/`NormBand` flag pairs its color with a glyph and a text label (visible or `sr-only`).
- **Don't** scatter the teal accent as decoration (tinted chip backgrounds, colored borders on routine content) — it is committed at region/component scale (hero band, score arc, primary actions) or not used.
- **Don't** treat `--attention`'s originally-specified `#A8681C` as current — the shipped, AA-compliant value is `#96601A`; do not revert it while chasing the direction contract's literal text.
