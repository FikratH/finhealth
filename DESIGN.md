---
name: Tonus
description: A company's financial diagnosis rendered as a vital-signs instrument — seven-segment figures on a near-black monitor.
colors:
  paper: "#0A0C0E"
  panel: "#101418"
  ink: "#E6EDF0"
  ink-muted: "#7C8A92"
  line: "#1E242A"
  ghost: "rgba(25, 194, 176, 0.1)"
  grid: "rgba(25, 194, 176, 0.05)"
  scrim: "rgba(10, 12, 14, 0.6)"
  accent: "#19C2B0"
  good: "#33E07A"
  attention: "#FFB020"
  critical: "#FF4A3A"
typography:
  segment:
    fontFamily: "DSEG7 Classic, Consolas, monospace"
    fontWeight: 700
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 400
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 400
  label:
    fontFamily: "PT Mono, monospace"
    fontWeight: 400
    letterSpacing: "0.025em"
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
  instrument-module:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "0"
    padding: "12px 16px"
  annunciator-cell:
    backgroundColor: "{colors.panel}"
    rounded: "0"
    padding: "16px 20px"
  origin-ticket:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-muted}"
    rounded: "0"
    padding: "2px 8px"
---

# Design System: Tonus

## Overview

**Creative North Star: "The Vital-Signs Monitor"**

Tonus renders a company's financial diagnosis as a vital-signs instrument — scoreboard, patient monitor, price totem — built from one eight-cell seven-segment alphabet where unlit cells are designed as deliberately as lit ones. This is the shipped «Tonus Monitor» world (founder-chosen, 2026-08-27), and it formally REPLACES the prior «Лабораторное заключение» (Lab Report) rendition: that world's paper-and-ink grammar is not deleted, it demotes to a secondary "paper" screen theme (reachable via the existing theme toggle) and to the forced print register — a printed diagnosis stays a document, never a screenshot of a monitor.

The material is near-black and flat: instrument ground `#0A0C0E`, bezel panels `#101418` edged in 1px `--line` borders, zero shadows anywhere — depth comes from bezel lines and a shared teal edge-glow device standing in for elevation. Ink is spent at full saturation with spot-ink discipline: one structural brand LED (teal) plus a true good/attention/critical status triad, each color doing exactly one job; the sole deliberately desaturated ink is the ghost tone reserved for "unlit, not absent." Type has three working voices — segment-mask figures (the custom `SegmentDisplay` CSS-clip-path component, DSEG7 as its static >6-cell fallback), PT Mono uppercase-tracked labels and tickets, and Inter prose/headings. STIX Two Text, the old world's scientific-publishing serif, retires from screen entirely and returns only under `@media print`.

Motion follows a single boot grammar: every state change is a sequenced *instant* swap (GSAP `.set()` timelines, never a tweened color), driven by three primitives in `lib/motion.ts` — `igniteSequence` (segment/cell-by-cell ignition), `scanlineSweep` (a thin teal line crossing a section as content ignites behind it), and `blinkPending` (the flashing-12:00 idiom, reserved exclusively for pending/unset values). Reduced motion collapses every one of these to its finished, fully-lit state instantly — "instruments simply already on." The old world's serif headlines, reference-interval bracket notation, and rotated ink-stamp verdict are rejected as the primary register and survive only where the paper theme or print explicitly keeps them.

**Key Characteristics:**
- Eight-cell truth: every `SegmentDisplay`/`LedBar` cell always renders its full shape — an unlit segment is a ghost-toned bar, never omitted, never a fabricated zero
- Bezel-and-glow depth: zero shadows; 1px `--line` borders plus `.elevated-surface`'s shared teal glow are the only "lift," reserved for floating panels
- Full-saturation, spot-ink LED discipline: one brand teal, one true status triad, each with exactly one job; ghost is the only intentionally desaturated ink
- One metronome, boot grammar: instant `data-lit` attribute swaps, `MOTION.step` = 60ms cascades, `MOTION.sweep` = 450ms scanline entries, 0.5s blink reserved for pending states only
- Two registers, one document: screen defaults to the monitor (dark, `:root`); the theme toggle switches to the paper register; print forces paper regardless of the active screen theme
- Designed absence: null/unset renders as ghost cells, «Н/Д», or a domain-specific unavailable label — never hidden, never a silent 0
- Latin "Tonus" always: the founder's pulse-line PNG wordmark, never «Тонус» in any locale; segment masks carry numeric figures only, never the wordmark

## Colors

A near-black instrument ground lit by one structural LED (teal) and a true-LED status triad; the old lab-report's paper-and-ink palette survives only as the secondary theme and the forced print register.

### Primary
- **Brand Teal** (`#19C2B0`): the system's one structural LED ink — wordmark ignition and scanline reveal, the landing CTA's lit-button glow, active states, primary buttons, focus rings, the neutral-tone calibration cursor, the current step's glow on `StepIndicator`, and every `-brand` utility (never `-accent`; see the Accent-Surface Trap).

### Neutral
- **Paper** (`#0A0C0E`): the instrument ground — `--background`, the page/document base.
- **Panel** (`#101418`): the bezel surface every instrument device sits on (`InstrumentModule`, `AnnunciatorCell`, `Select`/`Popover`/`AlertDialogContent`, `SiteHeader`'s "console strip") — distinct from Paper so depth reads through the 1px Line border alone.
- **Ink** (`#E6EDF0`): primary text and structural borders (`border-2 border-ink` on the score-header panel).
- **Ink Muted** (`#7C8A92`): secondary text, muted labels, `CalibrationScale`'s tick marks and bound labels.
- **Line** (`#1E242A`): the 1px hairline for every bezel edge, divider, and unlit track.
- **Ghost** (`rgba(25, 194, 176, 0.1)`): the "unlit segment" tone — every `SegmentDisplay` bar and `LedBar` cell not currently lit, and the ghost-cell-texture dot grid for empty instrument bays (upload dropzone, empty value slot, the `/my` signed-out gate, empty analyses/documents lists, results-not-found). Teal-family, not gray: absence still reads as this instrument's own ink, just off.
- **Grid** (`rgba(25, 194, 176, 0.05)`): the sub-5%-opacity ink for the `.grid-paper` millimeter-grid utility.
- **Scrim** (`rgba(10, 12, 14, 0.6)`): the modal-overlay dimmer. Register-invariant by design — unlike Paper/Ink, which flip meaning between registers, a scrim's job is identical in both, so it is pinned to the monitor register's own near-black rather than swapping with the active theme.

### Status Triad (true LEDs)
- **Good** (`#33E07A`): "✓" — `StatusGlyph`/`StatusPill` for a passing metric, `LedBar`'s `good` tone.
- **Attention** (`#FFB020`): "▲" — `StatusGlyph`/`StatusPill` for a borderline metric, `LedBar`'s `attention` tone.
- **Critical** (`#FF4A3A`): "✕" — `StatusGlyph`/`StatusPill` for a failing metric, the sole `--destructive` mapping.

Brand, Ink, and the full status triad each clear WCAG AA's 4.5:1 text-contrast threshold against both Paper and Panel — Critical is the tightest at roughly 5.9:1 on Paper, the rest clear 8:1+. Every LED glow (`text-shadow`/`box-shadow` blur) layered on top of these is pure decoration on an already-AA base color, per the direction's contrast discipline.

### Named Rules
**The Accent-Surface Trap.** (carried forward, unchanged mechanism) Tailwind's `bg-accent`/`text-accent`/`border-accent` are shadcn's semantic accent-role utilities — in `app/globals.css` they resolve through `--color-accent: var(--accent-surface)`, a pale `color-mix(in oklch, var(--accent) 14%, var(--paper))` wash (10% in the paper register), never the real Brand Teal. The real teal is only reachable via `text-brand`/`border-brand`/`bg-brand` (`--color-brand: var(--accent)`) or a raw `var(--accent)`/`var(--primary)`. Every component that means the real teal — `SelectTrigger`'s focus ring, the landing CTA's glow, `StepIndicator`'s current-step text-shadow, `CalibrationScale`'s neutral cursor, `OriginTicket`'s accent tone — reaches for `-brand`, never `-accent`. The wash's one legitimate use is stock Radix state styling inherited as-is (`SelectItem`'s `focus:bg-accent` row highlight). Grep for a new `bg-accent`/`text-accent`/`border-accent` before assuming it renders teal.

**The Full-Saturation Rule.** Every LED ink (Brand, Good, Attention, Critical) is used at full saturation — never a tinted or muted variant of itself. Ghost (10% teal-family) is the only deliberately desaturated ink in the system, reserved exclusively for "this is unlit, not absent." A color that needs to read as quieter drops role to Ink Muted rather than losing saturation.

**The Print-Drops-Backgrounds Rule.** Print engines drop `background-color` fills by default (no `print-color-adjust` is set anywhere in this codebase), so every device that signals via a background paint — `SegmentDisplay`'s segment/ghost bars, `CalibrationScale`'s track/band/cursor, `LedBar`'s cells — is invisible on paper unless it ships a `print:hidden` twin paired with a `print:inline`/`print:inline-flex` plain-text restatement of the same value. Two shipped regressions taught this the hard way; see each device's print-twin note under Components.

## Typography

**Display Font:** Inter (with system-ui, sans-serif fallback)
**Body Font:** Inter (with system-ui, sans-serif fallback)
**Label/Mono Font:** PT Mono (with monospace fallback)
**Segment Font:** DSEG7 Classic (vendored via `@fontsource/dseg7`, SIL OFL 1.1 — `app/[locale]/layout.tsx`), monospace fallback

**Character:** Inter now carries both the heading and body voice — STIX Two Text, the old lab-report's scientific-publishing serif, retires from screen entirely (`--font-display: var(--font-inter)`) and is forced back only under `@media print` (`--font-display: var(--font-stix-two-text) !important`), so a printed diagnosis keeps the original document's typographic register while the screen commits fully to the instrument idiom. Because no screen route renders it anymore, STIX's `next/font` config also dropped `preload` (`preload: false`) — the face still loads on demand the moment a print stylesheet actually needs it, rather than costing every route an eager fetch for a face only print ever uses. PT Mono remains the Cyrillic-first mono for every label, ticket, and number that isn't a segment-mask figure. DSEG7 is the instrument's most literal voice — the static fallback beyond 6 cells, and any other fixed segment-styled figure.

### Hierarchy
- **Segment** (DSEG7 static, or the animated `SegmentDisplay` CSS-mask for ≤6 cells; sized `text-xs`–`text-7xl` by context, always `tabular-nums`): every headline figure — the overall score, every `InstrumentModule` figure.
- **Display** (Inter, `text-4xl`–`text-5xl` on the hero h1, `text-lg`–`text-2xl` on `SectionHeading`/`AlertDialogTitle`): section headings, page-level headlines.
- **Body** (Inter, default size): paragraph copy, disclaimers, narrative prose.
- **Label** (PT Mono, `text-xs`–`text-sm`, usually `uppercase tracking-wide`, `tabular-nums` for numerals): `InstrumentModule`/`AnnunciatorCell`/`OriginTicket`/`StepIndicator` labels, form input values, footnote markers.

### Named Rules
**The Wordmark Rule.** "Tonus" is set in Latin always — never «Тонус» in any locale (founder mandate, i18n strings updated accordingly) — and always as the founder's pulse-line PNG lockup (`public/brand/logo-teal.png` on the monitor register, `logo-black.png` on paper), never re-typeset. A `SegmentDisplay`/DSEG7 mask carries numeric figures only; it never renders the wordmark itself.

**The Never-a-Silent-Zero Rule.** A real, non-zero magnitude never rounds down to a displayed `0`. `my-documents-table.tsx`'s file-size column checks `bytesToMB(size_bytes) < 0.1` — the smallest value `decimals: 1` can distinguish from true zero — and swaps in an explicit bound, «<0,1 МБ», rather than a rounded `0,0 МБ` that reads as an empty file. The same law that keeps a `null` from ever rendering as `0` (designed absence) extends to a real, present, merely-small value.

## Layout

Content measure is unchanged from before the redesign: `max-w-5xl` + `mx-auto` + `px-6` remains the one recurring container width across every route-level surface (`SiteHeader`, `SiteFooter`, the hero's utility row and content block, `results-document`, the analyze flow, methodology). The redesign changed ground and material, not text measure. The landing hero keeps the "commit at region scale" exception, but the region itself changed: its outer `<section>` is `bg-paper` (the near-black instrument ground), full-bleed, not the old teal `bg-brand` band — teal is no longer spent as a background wash anywhere, consistent with the Full-Saturation rule moving teal to line-art and glow rather than area fills. Hero content still splits `md:grid-cols-2`: left column headline/CTA, right column one `DemoInstrument` — explicitly not wrapped in a second outer bezel ("`InstrumentModule` already is the one bezel; nesting a second frame is the 'nested cards' anti-pattern the craft floor bans"). The one-document continuity raise carries forward unchanged: upload → verify → diagnosis is one continuous document, not disconnected pages.

## Elevation & Depth

Flat by law — the direction bans shadows outright ("depth via bezel lines and glow"). Depth reads through two devices only: the 1px `border-line` edge every panel/module carries, and `.elevated-surface` (`app/globals.css`), the world's own active-state stand-in for a drop shadow — a faint teal edge-glow applied to any panel-on-panel floating surface.

### Shadow Vocabulary
- **elevated-surface glow** (`box-shadow: 0 0 12px -2px color-mix(in oklch, var(--accent) 30%, transparent)`): the one "lift" a floating panel gets over the board beneath it — `PopoverContent` unconditionally; a `<details>` disclosure only for the span it is actually `[open]`.
- **LED cell / segment glow** (`box-shadow: 0 0 3px 0.5px var(--cell-tone)` on a lit `LedBar` cell; `0 0 0.12em 0.02em color-mix(in oklch, var(--accent) 70%, transparent)` on a lit segment bar): decorative reinforcement that an LED is on — never used to imply surface elevation.

### Named Rules
**The No-Shadow Rule.** (unchanged doctrine, new mechanism) No component may use a resting or hover drop shadow to imply elevation. `.elevated-surface`'s glow is the sole exception, and it signals "lit/active," not generic depth.

**The Open-State CSS Rule.** A hand-written CSS class that must respond to an element's own open/expanded state (like `.elevated-surface` on a `<details>`) uses a real CSS attribute selector — `details.elevated-surface[open] { ... }` — never Tailwind's `open:` variant, which only compiles for registered Tailwind utility classes and silently no-ops on unregistered hand-written ones. Radix-driven surfaces (`Select`/`Popover`/`AlertDialogContent`) are unaffected: their `data-open:`/`data-closed:` variants target registered Tailwind animation utilities (`animate-in`, `fade-in-0`), which compile correctly.

**The Print-Twin Rule.** Every background-painted device — `SegmentDisplay`'s segment/ghost bars, `CalibrationScale`'s track/band/cursor, `LedBar`'s cells — ships `print:hidden` paired with a `print:inline`/`print:inline-flex` plain-text twin carrying the identical value. Two shipped regressions made this a hard rule, not a suggestion.

## Shapes

Square-cornered rectangles are the instrument's default form: `InstrumentModule`, `AnnunciatorCell`, `OriginTicket`, and every `Select`/`Popover`/`AlertDialogContent` bezel carry no radius at all — only interactive controls (buttons, inputs, Select triggers) carry the modest `rounded-lg`/`rounded-md` scale (`--radius: 0.5rem` base, scaled `sm`/`md`/`lg`/`xl`). `SegmentDisplay`'s decimal point is the one circular element, via `rounded-full` — the same idiom every other dot/cursor in the system uses (`StatusPill`'s LED dot, `CalibrationScale`'s cursor). The old world's signature tilted double-border ink stamp is retired along with the rest of the lab-report grammar; the verdict is now a flat, unrotated `AnnunciatorCell` inside a square `border-2 border-ink` panel.

## Components

### Buttons
- **Shape:** `rounded-lg` on default/lg sizes, smaller radii on `xs`/`sm`/icon variants (`components/ui/button.tsx`).
- **Primary (`default`):** `bg-primary` (teal) / `text-primary-foreground` (paper), `hover:bg-primary/80`.
- **Outline / Secondary / Ghost / Destructive / Link:** shadcn variants restyled onto the instrument tokens; `text-destructive` maps to `--critical`.
- **Focus:** `focus-visible:ring-3 focus-visible:ring-ring/50`; active press is a 1px `translate-y-px` nudge — except the landing hero's CTA.
- **The landing CTA — a literal physical button:** `border-2 border-brand bg-panel px-8 py-3.5 font-mono uppercase` with a lit-LED glow (`shadow-[0_0_16px_2px_color-mix(in_oklch,var(--accent)_40%,transparent)]`) that visibly dims on `:active` (down to `0_0_8px_1px`, roughly half the spread) — "being pressed" is entirely a glow-intensity change, never a translate or inset-shadow trick.
- **The sanctioned duality (finish-review adjudicated):** the bezel-glow physical CTA is reserved for primary conversion actions only — the landing hero and pricing's Pro-tier waitlist. Every quiet utility action (404's «На главную», a resend/retry button) stays the stock filled `default` variant. The physical treatment stays rare on purpose; if every button glowed, none would read as "the one lit action."

### Origin Tickets
`components/origin-ticket.tsx` — the evolved specimen-chip idiom: `border bg-panel px-2 py-0.5 font-mono text-xs uppercase tracking-wide`, no radius. Tones: `neutral` (`border-line text-ink-muted`, the default), `accent` (`border-brand text-brand`), `attention` (`border-attention text-attention`). Use: industry/period/currency/scale/«ДЕМО-ДАННЫЕ» metadata, the provenance-traced accent ticket (`ratio-row.tsx`, «Прослежено») wired to a source trace disclosure via a persistent `border-l-2 border-brand/40` connector rule — "visible seams": the wire to the source is always visible, never hidden entirely inside a popover — the account plan chip (`my-analyses-view.tsx`, «Тариф: FREE»/«Тариф: PRO», display-only, no endpoint enforces the limit yet), and each document's file-kind chip (`CSV`/`PDF`, `my-documents-table.tsx`). The plan and file-kind chips use the default `neutral` tone.

### Instrument Modules
`components/instrument-module.tsx` — the metric-tile grammar: `border border-line bg-panel px-4 py-3`, label top-left (`font-mono text-xs uppercase tracking-wide text-ink-muted`), figure in segments, unit small (`font-mono text-sm text-ink-muted`). One bezel per module — never nested inside a second bezel.

### Calibration Scales
`components/calibration-scale.tsx` — the норма-band-with-LED-cursor idiom, evolved from the old reference-interval bracket: a `bg-line` track and band fill, tick marks at low/high, and a glowing cursor dot (`bg-{tone} shadow-[0_0_5px_1px_var(--{tone})]`; the `neutral` tone deliberately mixes `bg-brand` fill with `--accent` glow). The graphical gauge is `print:hidden`; a `print:inline-flex` text line (`value · label range`) is its mandatory twin.

An optional second reference point — a KZ-sourced economy/industry benchmark (the `kz` prop) — renders as a small hollow `border-brand` square, never a second LED dot: shape, not color, distinguishes it from the round cursor (a second hue would either collide with the good/attention/critical vocabulary or require inventing one this system doesn't have). Unrotated, per the shape vocabulary's retirement of the tilted-stamp idiom. Sits `bottom-full` — offset above the track's center line, never on it — so it can never occlude the cursor even when both compute to the same horizontal position; occlusion is structurally impossible, not merely unlikely. The mark renders only when the KZ value falls on the track's own headroom-extended axis; off-axis, it is suppressed outright (a designed absence, not a clamped-and-silently-wrong position), and `ratio-row.tsx`'s always-rendered provenance line annotates the absence in text — « — за пределами шкалы» — right where the number already lives. That provenance line is the KZ fact's sole print register: the graphical mark carries no print twin of its own, so the fact prints exactly once, not twice. An economy-wide reference (as opposed to an industry-specific one) discloses its scope on both the visible provenance-line label and the gauge's own accessible name — «ориентир РК (экономика в целом)» versus the industry-specific «ориентир РК» — from one source string, never a separate footnote a reader could skim past.

### Named Rules (Calibration)
**The Reference Marks Are Static Rule.** A reference mark (the KZ benchmark square) never ignites, blinks, or otherwise animates — the boot grammar belongs exclusively to readings (values the instrument measured) and pending states (values not yet known), never to a static fact painted onto the same track. A future reference mark that claims motion is out of register with the rest of the world.

### LED Bars
`components/led-bar.tsx` — a discrete segmented LED bar-graph replacing every continuous hairline progress fill from the old world. Lit cells (`data-lit="true"`, tone via an inline `--cell-tone` custom property) glow `box-shadow: 0 0 3px 0.5px var(--cell-tone)`; unlit cells are flat `bg-ghost`. Purely decorative (`aria-hidden`) — the caller's own text/`aria-valuenow` carries the real value.

### Provenance & Confidence Grammar
Every extracted figure resolves to exactly one of three provenance states (`ratio-row.tsx`'s internal `ProvenanceRow`), each visually distinct so they can never be mistaken for one another: `derived` and `not_found` render a bare `OriginTicket` («расчётное значение» / «не найдено в документе»); `sourced` renders a `ConfidenceMeter` (or an accent `OriginTicket` reading «отредактировано вручную» if the analyst hand-edited the value) alongside the as-written label, the raw source string, and a truncated snippet behind `SourcePopover`. `ConfidenceMeter` itself is a bezelled `LedBar` track (`h-1.5 w-24 border border-line bg-panel`, `role="meter"` — a trust reading, not task progress) plus a numeric percentage: teal (`brand` tone) at 60% confidence or above, amber (`attention` tone) below it.

A value extracted via OCR (a scanned, not text-layer, PDF) carries its own honesty marker riding the raw source string itself — «(распознано OCR)» is concatenated straight into the page/row citation the backend already writes (e.g. «PDF, стр. 3 (распознано OCR), строка 12»), so it surfaces wherever that string already renders — `SourcePopover` and `ProvenanceRow`'s source line — with no separate chip or component of its own. OCR confidence is hard-capped at 60 server-side, on top of the flat penalty every table-less PDF already carries: an OCR read never claims full confidence, however clean the extraction looks, because OCR's own job is "here is what was seen," not "was it right." Note the boundary: `ConfidenceMeter`'s amber threshold triggers strictly below 60, so a maximally-confident OCR value (capped exactly at 60) still renders in the ordinary teal tone, not amber — the cap sets a ceiling, it does not itself guarantee the low-confidence visual state.

### Annunciator Cell (the «заключение» verdict)
`components/annunciator-cell.tsx` — a large lit-label cell inside a bezel (`border border-line bg-panel px-5 py-4`), the world's replacement for the old rotated ink stamp. Status maps to color plus a matching text-shadow glow, plus a `StatusGlyph` (✓/▲/✕/·) — color is never the only signal. `score-header.tsx` wraps it `aria-hidden="true"`; the real accessible name is a sibling `sr-only <h1>`, to avoid double-announcing the verdict.

### Segment Display (the signature primitive)
`components/segment-display.tsx` — the "eight-cell truth": every cell always renders all seven segment bars; an unlit bar is the permanent Ghost tone, never omitted. `value: number | null` — null renders a full ghost figure, never hidden, never a fabricated `0`. Animated mode (≤6 cells, CSS grid + `clip-path` masks with per-segment `data-lit` control, driven by `igniteSequence`) is the default; beyond 6 cells it falls back to a static DSEG7 render. `role="img"`, accessible name = the formatted value or an explicit `naLabel` (e.g. «Н/Д»), plus an optional caption. Ships `print:hidden` with a `print:inline` plain-numeral twin.

### Price Totem
`components/pricing/price-figure.tsx` wraps `SegmentDisplay` with its own mount-time `useGSAP(() => ref.current?.ignite())` — a Persuade surface earning one authored ignition moment, the same device the score header uses on load. Sized one step down from the score (`text-5xl sm:text-6xl` vs. the score's `text-6xl sm:text-7xl`) — a price tag never outranks the app's single largest reading. Currency and period render as PT Mono adjuncts *outside* the mask (`items-baseline` flex siblings), never inside it — the same figure-plus-unit split `InstrumentModule` already uses. The Free tier's literal `0` is a lit segment, not a ghost: a genuinely-zero price is a real value, and designed absence («Н/Д», ghost cells) is reserved for missing data, which a $0 price isn't.

### Step Indicator
`components/analyze/step-indicator.tsx` — "always-lit you are here": all three steps render at full legibility simultaneously on the same `bg-panel` bezel, differentiated by border/text/glow only (current: `border-brand text-brand` plus a teal text-shadow; done: `border-line text-brand`; upcoming: `border-line/40 text-ink-muted`) — never dimmed to near-invisibility. Blink is reserved for the current step, only while genuinely pending.

### Inputs / Fields, Select, Overlays
- **Style:** `border border-line bg-panel font-mono text-sm` — a bezel field, not shadcn's stock rounded-pill control.
- **Focus:** real Brand Teal (`border-brand`) plus a low-spread glow — deliberately not `border-accent`/`bg-accent`, which resolve to the pale wash and read as barely-there on the near-black ground.
- **Error/Invalid:** `border-critical`.
- **`SelectContent`/`PopoverContent`/`AlertDialogContent`:** bezel grammar throughout (`border border-line bg-panel`, no radius, no shadow); `PopoverContent` additionally carries `.elevated-surface` unconditionally.
- **Scrim:** `AlertDialogOverlay` uses `bg-scrim`, not `bg-ink/40` — the old class was a leftover from the paper-only world where `--ink` was always dark; post-inversion it would paint a translucent *white* haze over the dark monitor ground instead of dimming it.

### Tables (the History-as-Document Idiom)
`components/my/my-analyses-table.tsx` and `my-documents-table.tsx` render account history the way the rest of the app renders everything else — as a document, not a data-grid widget: `border-b border-line` hairline rows inside one `border border-line bg-panel` wrapper, `font-mono text-xs uppercase tracking-wide text-ink-muted` column headers, `OriginTicket`s for industry/file-kind, `MetricNumber`/`StatusPill` for the score cell.

**`.table-scroll-x`** (`app/globals.css:595-613`) is the world's sanctioned wide-table affordance at narrow viewports: a palette-themed scrollbar (`scrollbar-color: var(--line) var(--panel)`, matching WebKit thumb/track) plus a scroll-position-aware edge fade — two `background-attachment: local` panel-colored gradients that scroll with the content to mask clipped cells, layered under two `background-attachment: scroll` teal-tinted gradients (`color-mix(in oklch, var(--accent) 35%, transparent)`) that stay fixed to the viewport edge as a persistent "more content this way" glow. The glow, not a gray drop-shadow, is deliberate — the same "signal via LED-ink, never a blurred shadow implying depth" device as `.elevated-surface`.

### Named Rules (Tables)
**The Relative-Containing-Block Rule.** A scroll-clipped wrapper (`overflow-x-auto`) that contains an absolutely-positioned descendant — most often a `sr-only` accessible-name span with no other positioned ancestor — must also carry `position: relative` itself. `overflow-x-auto` alone does not establish a CSS positioning context; without an explicit `relative` on the clipping element, the descendant computes its static position from its unscrolled location inside the full-width table and escapes the clip entirely, silently inflating `document.documentElement.scrollWidth` (measured: 548px of invisible overflow at a 390px viewport, from two 1×1 escaped spans, with zero visible symptom). Both table components carry `relative table-scroll-x overflow-x-auto` together for this reason, pinned by a tripwire unit test asserting the `relative` class survives plus an e2e test that samples real `scrollWidth` at runtime.

### Instrument Switch (Toggle)
The opt-in retention control (`upload-step.tsx`'s `retainOffered` checkbox, and `DocumentControls`' `audited` toggle) shares one grammar: a visually-hidden native `<input type="checkbox" className="peer sr-only">` drives a decorative bezelled track (`border border-line bg-panel`, `h-4 w-8`) and an LED thumb (`peer-checked:translate-x-4 peer-checked:bg-brand peer-checked:shadow-[0_0_4px_1px_var(--accent)]`) via the CSS `peer` pattern — real checkbox behavior and screen-reader semantics stay on the actual control while the visible focus ring (`peer-focus-visible:border-ring`) lands on its decorative sibling, never the invisible input itself. The retention switch specifically is double-gated — rendered only when the visitor is signed in *and* the server's `/api/health` capability signal reports `vaultEnabled` — and defaults off either way, matching the product's privacy-by-default posture.

### Auth & Signed-Out States
`signin-form.tsx` uses the same bezel field grammar as every other editable instrument (`border-line bg-panel`, `focus-visible:border-brand` plus the low-spread teal glow — never `border-accent`) for its email input, and wraps both its idle and "sent" states in an identical `border border-line bg-panel p-6 sm:p-8` panel — the sent confirmation is a composed document-grammar panel, not a toast: an `OriginTicket tone="accent"` chip, a display headline, and a "resend" outline button replace the form outright.

The `/my` route's signed-out and session-expired states share one gate (`my-analyses-view.tsx`): an unlit instrument bay — `ghost-cell-texture border border-line bg-panel` — with a heading, body copy, and a sign-in CTA. Neutral tone throughout, deliberately off the critical/attention LEDs: being unauthenticated isn't a failure state. The same `ghost-cell-texture` bezel covers every other "nothing here yet" surface in the app — one texture, one meaning, reused rather than each screen inventing its own empty state.

**Current-location grammar** (`AccountMenu`, `components/account-menu.tsx`): the header's "Мои анализы"/"Войти" links mark whichever one matches the current route with `aria-current="page"` plus `StepIndicator`'s exact current-step class (`text-brand [text-shadow:0_0_0.3em_var(--accent)]`), reused verbatim rather than inventing a second "you are here" language.

The `role="status"` live-region idiom on a terminal confirmation panel now has two call sites — `signin-form.tsx`'s sent state and `pricing/waitlist-form.tsx`'s joined/already-joined state, the latter wrapping an `AnnunciatorCell` rather than a second bezel of its own (nesting one would be the "nested cards" anti-pattern). Both are hardened to the same robust shape: the `role="status"` div is unconditionally in the tree from first render — empty until the terminal state, never unmounted afterward — so it is already a registered live region by the time its content changes, rather than popping into existence already populated. A screen reader only reliably announces a live region's content changing if the region itself was already present in the accessibility tree before the change; a brand-new `role="status"` element that mounts with its content already inside it isn't guaranteed to announce at all. Only the waitlist form adds programmatic focus on top of that shared idiom: `tabIndex={-1}` plus a `ref.current.focus()` call on mount moves keyboard focus onto the confirmation panel itself, so a keyboard user isn't stranded on `<body>` once the submit button they were focused on unmounts along with the whole form.

### Error States (404 vs. Root Crash)
The two-tone error doctrine — na/designed-absence tone for "nothing here," critical red for "something broke" — now spans both the route level and the root boundary. `not-found.tsx` renders the same `ghost-cell-texture border border-line bg-panel` bay as the `/my` signed-out gate, with an `ink-muted` «·» glyph standing in for a heading eyebrow: a 404 is an honest "not lit here" reading, not a failure, and stays off the critical/attention LEDs entirely. Its CTA is the stock primary `Button` — quiet utility navigation, not a conversion moment.

`app/global-error.tsx` — Next's last-resort root error boundary, which replaces `<html>`/`<body>` outright and does not inherit `app/globals.css` — renders the real-failure register instead: a critical-red «✕» glyph with the same text-shadow glow device `AnnunciatorCell` uses, inside a `--critical`-bordered `--panel` bezel. Because neither Tailwind utilities nor CSS custom properties are guaranteed loaded this far outside the locale layout, every value is a literal hex pulled from this document's own token table, each one comment-annotated with the token it stands in for (`backgroundColor: "#0a0c0e", // --paper`, `color: "#ff4a3a", // --critical`, and so on) rather than a `var(--x)` reference or a Tailwind class — and both RU/EN copy is hardcoded inline, since next-intl itself is unavailable this far outside the locale layout.

### Named Rules (Error States)
**The Root-Boundary Literal-Hex Rule.** Any surface that can render before or outside the locale layout — currently only `global-error.tsx` — cannot assume `app/globals.css`'s custom properties or any Tailwind utility class are loaded, so it restates the token values it needs as literal hex, each one commented with the token name it stands in for. This is the one sanctioned exception to "always reference the token, never the literal color," scoped exclusively to root-boundary surfaces and never a precedent for anywhere else.

### Server-Boundary Constants (Implementation Grammar)
A string constant that a Server Component needs to import (a class-name string, not a component) lives in a directive-free module — no `"use client"`/`"use server"` at the top — never re-exported from a `"use client"` file it happens to originate in. `components/nav-link-class.ts` and `components/pricing/physical-button-class.ts` are both plain modules for this reason: Next bundles a directive-free module into whichever graph (server or client) each importer belongs to, so a Server Component (`SiteFooter`, `PricingTiers`) and a Client Component (`SiteHeader`, `AccountMenu`, `WaitlistForm`) can both import the real string.

### Named Rules (Implementation)
**The Server-Boundary Constants Rule.** (hard-won) A Server Component importing a named export from a `"use client"` module receives a client *reference* for it, not the actual value — a string-consuming call like `cn()` silently drops a non-string reference with no build error, no type error, and no signal from a jsdom-based component test, because jsdom does not enforce the RSC server/client boundary. `SiteFooter` imported a shared link-tone constant from `account-menu.tsx` (a `"use client"` module) exactly this way in an earlier round: the footer's Pricing link kept its href and text but silently lost every one of its idle-tone classes on every prerendered page, invisible to the whole test suite except one Playwright test that renders the real built HTML and asserts the class is present. Any shared string constant a Server Component might import must live in a directive-free module from the start.

### OG Raster (Launch Surface)
`public/og/og-default.png` — the one Open Graph/Twitter card every launch route points at — is a committed, hand-regenerated capture, not a build-time render. `app/[locale]/dev/og/page.tsx` (a dev-only route, 404s once `NODE_ENV==="production"`, same discipline as `/dev/tokens`) composes the actual card: `grid-paper` texture on `bg-paper`, the founder's pulse-line wordmark, the landing hero's own sanctioned h1 copy, and a ghost `SegmentDisplay` row (`value={null}`, six digits, fully unlit) beneath the headline — the same designed-absence primitive used everywhere else, reused here so the card asserts no invented figure or fabricated statistic; it reads as the instrument's signature alphabet at rest. `scripts/generate-og.mjs` drives Playwright against that route at a fixed 1200×630 viewport (`reducedMotion: "reduce"`, RU locale, the default prefix-free language) and writes the PNG. Re-run manually (`npm run dev`, then `node scripts/generate-og.mjs`) any time the composition changes — there is no build-time hook or npm script alias for it yet.

### Boot Grammar & Scroll Cinema (Motion System)
`lib/motion.ts`'s `MOTION` object is the one metronome: `fast: 0.15`, `base: 0.2`, `reveal: 0.6`, plus two tokens new to this world — `step: 0.06` (the boot grammar's inter-segment/inter-digit cascade spacing) and `sweep: 0.45` (a scanline's own crossing duration) — one ease family throughout (`power2.out`). Three primitives:
- **`igniteSequence(scope, targets, { attribute })`** — the boot grammar's law, "every change is an instant segment swap": flips each matched element's `data-lit` from `"false"` to `"true"` one at a time, `MOTION.step` apart, via a GSAP timeline of `.set()` calls, never a tween on the lit/unlit color. Drives `SegmentDisplay.ignite()` and `LedBar.ignite()`.
- **`scanlineSweep(section)`** — one thin teal line sweeps across a section over `MOTION.sweep` seconds (a genuine tween) while its content ignites behind it in discrete boot-grammar steps timed under the line's travel.
- **`blinkPending(el)`** — the flashing-12:00 idiom: a 0.5s full duty cycle (`opacity` 1↔0.25), reserved exclusively for a pending/unset value — never used for anything else.

Reduced motion collapses all three to their instantly-final state synchronously, no timeline created — "instruments simply already on."

### Named Rules (Motion)
**The One-Metronome Rule.** (carried forward, extended token set) Every GSAP tween's duration/ease comes from `MOTION`; `step` and `sweep` are the boot grammar's own additions to the same single object — no component invents its own cascade spacing or sweep duration.

**The Untracked-Restore Rule.** `results-document.tsx`'s `useGSAP` runs with `revertOnUpdate: true`, which reverts every *tracked* `gsap.set()`/timeline call made inside it whenever its dependencies change — including the mount-time `igniteSequence` cascades that lit the score digits and LedBar cells via tracked `tl.set()` calls. Because React's own render tree already believes those `data-lit` attributes are `"true"`, nothing else ever repairs a revert-caused rollback. The resync branch restores that state with plain, untracked `element.setAttribute("data-lit", "true")` calls — outside GSAP's tracking entirely — the same idiom the scanline-hiding machinery already used. Any future resync-safe state restoration in this effect must follow the same untracked-`setAttribute` pattern, never `gsap.set()`, or it will silently revert again on the next dependency change.

## Do's and Don'ts

### Do:
- **Do** reach for `text-brand`/`border-brand`/`bg-brand` (or raw `var(--accent)`) whenever you mean the real teal — `-accent` utilities render the pale `--accent-surface` wash instead (The Accent-Surface Trap).
- **Do** ship a `print:hidden` + `print:inline`/`print:inline-flex` text twin for any device that signals via a `background-color` fill (`SegmentDisplay`, `CalibrationScale`, `LedBar`) — print engines drop background paint by default.
- **Do** render `null`/absent values as ghost cells, «Н/Д» (via each component's `naLabel`), or a domain-specific unavailable label (e.g. a ratio row's «Не рассчитано») — never a bare `0`, never hidden space.
- **Do** pair every status color with a `StatusGlyph` (✓/▲/✕/·) and a text label — color is reinforcement, never the sole signal.
- **Do** draw every GSAP tween's duration/ease from `MOTION`, including the boot grammar's `step`/`sweep` tokens — no ad hoc cascade spacing.
- **Do** use a real CSS attribute selector (`.foo[open]`) for any hand-written CSS class that must respond to an element's own open/expanded state — Tailwind's `open:` variant silently no-ops on unregistered custom classes.
- **Do** restore GSAP-tracked attribute state that must survive a `revertOnUpdate` resync via a plain, untracked `setAttribute` call, never `gsap.set()` (The Untracked-Restore Rule).
- **Do** keep every instrument module to exactly one bezel — nesting a second frame around an already-bezeled component is the "nested cards" anti-pattern the craft floor bans.
- **Do** set "Tonus" in Latin script via the founder's pulse-line PNG lockup, in every locale — never «Тонус», never a re-typeset wordmark.
- **Do** give any `overflow-x-auto` wrapper that contains an absolutely-positioned descendant (e.g. a `sr-only` span) its own `relative` positioning context — `overflow-x-auto` alone does not establish one (The Relative-Containing-Block Rule).
- **Do** render a real, non-zero magnitude that rounds under display precision as an explicit bound (e.g. «<0,1 МБ»), never a rounded `0` that reads as empty (The Never-a-Silent-Zero Rule).
- **Do** gate an optional capability-dependent control (the retain-document switch) on both the auth state and the server's own capability signal — never auth alone, or a signed-in visitor on an unsupported deployment can trigger a failure the UI implied would work.
- **Do** reuse `StepIndicator`'s current-state glow class verbatim for any other "you are here" marker (`AccountMenu`'s nav links) rather than inventing a second current-location language.
- **Do** reserve the bezel-glow physical CTA for primary conversion actions and the stock filled button for quiet utility navigation — the finish review adjudicated this split explicitly.
- **Do** render a genuinely-zero value as a lit figure, never a ghost — designed absence is for missing data, not a real zero.
- **Do** keep any string constant a Server Component might import in a directive-free module from the start — a `"use client"` origin module silently downgrades a named export to a client reference for a Server Component importer (The Server-Boundary Constants Rule).
- **Do** restate token values as literal, comment-annotated hex on any surface that can render before or outside the locale layout (currently only `global-error.tsx`) — its CSS custom properties are not guaranteed loaded there.
- **Do** render an out-of-range or otherwise unplottable reference value as a suppressed mark plus a text annotation naming the absence, never a clamped-and-silently-wrong position.
- **Do** disclose an economy-wide (vs. industry-specific) reference's scope in both its visible label and its accessible name, from one source string.
- **Do** keep reference marks static — never ignited, never blinking; the boot grammar is for readings and pending states only (The Reference Marks Are Static Rule).
- **Do** mount a live-region element unconditionally from first render, empty until it has something to announce, rather than creating it already populated — the only shape screen readers reliably announce.

### Don't:
- **Don't** add a `box-shadow`/`shadow-*` for resting or hover elevation — `.elevated-surface`'s teal glow is the sole active-state exception, and it signals "lit," not generic depth.
- **Don't** use a tinted or desaturated variant of Brand/Good/Attention/Critical to read as "quieter" — drop to Ink Muted instead; Ghost is the only intentionally desaturated ink in the system, reserved for "unlit."
- **Don't** tween a `data-lit`/segment/LED color change with a CSS transition — every lit/unlit swap is an instant attribute flip driven by `igniteSequence`, never a fade.
- **Don't** use `blinkPending` for anything other than a genuinely pending/unset value.
- **Don't** reintroduce the retired lab-report grammar (serif display type, the rotated double-border ink stamp, reference-interval bracket notation) into the monitor screen register — it survives only in the paper theme and the forced print register.
- **Don't** render the wordmark inside a `SegmentDisplay`/DSEG7 segment mask — segment masks carry numeric figures only.
- **Don't** use `bg-ink/40` (or any other foreground/surface token) for a modal overlay — `bg-scrim` is the one register-invariant overlay token; foreground/surface tokens flip meaning between the monitor and paper registers and will paint the wrong tone in at least one of them.
- **Don't** assume `overflow-x-auto` alone clips an absolutely-positioned descendant — without an explicit `position` on the same element, the descendant escapes the clip and silently inflates page scroll width.
- **Don't** let a 404/not-found surface use the critical/attention LED colors — an honest absence is not a failure; reserve critical red for a genuine root-level crash.
- **Don't** re-export a shared class-name constant from a `"use client"` module for a Server Component to import — even if it works in every jsdom test, it silently degrades to a client reference at build time with no signal short of an e2e class assertion.
- **Don't** give a reference mark a second LED-cursor color — a hollow, unrotated square is the shape vocabulary's distinction, not a new hue.
- **Don't** assume a capped confidence value (e.g. OCR's 60-point ceiling) will render in the meter's low-confidence amber tone — the threshold triggers strictly below the cap, so a maximally-confident capped value still reads as ordinary teal.
