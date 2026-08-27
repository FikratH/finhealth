# Product

<!-- impeccable:product-schema 1 -->

<!-- Provenance: facts below were confirmed directly by the founder in a
structured interview 2026-08-26/27 (grilling session, recorded in
docs/spec/product-spec.md). Items marked [inferred] are controller
inferences under the founder's standing proceed-without-blocking
instruction, not confirmed answers. -->

## Platform

web

## Stack

Next.js 15 (App Router, TypeScript) + Tailwind + shadcn/ui + next-intl +
next-themes; GSAP + Lenis for the diagnosis experience (founder-specified in
the original brief). Backend is a separate FastAPI service consumed via
`/api/*` (contract: docs/api-contract-v1.md).

## Users

Primary: SMB owners/founders (Kazakhstan/CIS first, global second) who
receive financial statements from their accountant and cannot confidently
read them. Situation: they hold a PDF/XLSX/CSV of their own company's
statements and want to know "is my company healthy, and what should I do."
Secondary (v2, confirmed deferred): investors/analysts screening other
companies at portfolio scale.

## Product Purpose

Upload a financial statement → verify the extracted numbers → receive a
medical-checkup-grade diagnosis: 0–100 health score, ~27 ratios benchmarked
to the company's industry, strengths, risks, prioritized recommendations
with explicit tradeoffs, and a risk radar (Altman Z′, Piotroski F, Beneish
M, DuPont). Success = a non-CFO understands their company's condition and
knows their next three actions. Real startup built to sell; free tier is
the full wow, Pro gates persistence/power features.

## Positioning

Trust through radical transparency, which neighbors cannot truthfully copy:
every number is deterministic (no LLM computes anything), traceable to the
exact fragment of the user's own document, with the formula shown as a
substitution with their values; benchmark sources are cited in the payload
(Damodaran Jan-2026 et al.); simplifications and data gaps are always
disclosed ("insufficient data" is never dressed up as a score). The LLM (if
a key is present) only narrates around computed numbers.

## Operating Context

Statements arrive as RSBU/KZ-format PDF/XLSX/XLS/CSV (Наименование |
Код | periods), RU-language labels, values in thousands KZT typically.
Documents are deleted right after extraction (privacy default); only
verified numbers persist. The verify step (user corrects extracted values)
is a mandatory part of the flow and a trust moment, not friction. Bilingual
RU (source of truth, polished first) + EN (full quality).

## Capabilities and Constraints

- API contract frozen at docs/api-contract-v1.md; `overall_score` and many
  values are nullable — null renders as «Недостаточно данных»/«Н/Д», never 0.
- Expense metrics arrive as positive magnitudes; numbers display with
  RU thin-space grouping; money in document currency (no conversion).
- Payments deferred (Paddle planned); auth arrives Phase 5 (Better Auth);
  LLM narrative is OpenAI-keyed and optional — UI must be complete without it.
- No OCR yet: scanned PDFs get a clear "upload Excel/CSV" message.
- Undecided product facts: final brand name (Tonus AI pending trademark
  check), pricing figures (proposed, unapproved).

## Brand Commitments

Working name "Tonus" / "Tonus AI" (founder-chosen, pending Rospatent check).
The wordmark is ALWAYS Latin "Tonus" — never transliterated to «Тонус», in
any locale (founder mandate 2026-08-27). Founder rejected the first
rendition of the lab-report world (2026-08-27): too quiet, colors included —
the replacement direction must commit at full boldness (scrollytelling,
orchestrated GSAP/Lenis motion, committed color).
Design language (founder-confirmed): light clinical «lab report» base with a
full dark-mode toggle; premium-fintech restraint with the medical-checkup
metaphor deployed at key moments (score reveal, diagnosis sections), not as
a costume. Honesty is voice: no invented testimonials, logos, user counts,
or claims — the product's transparency IS the marketing. RU copy reads
natively written, never translated-sounding.

## Evidence on Hand

- Real demo company + real engine output: apps/api/demo/demo_company.csv →
  expected_analysis_example.json (score 85.1, full risk radar) — usable in
  UI demos/screenshots as "demo data", labeled as such.
- Benchmark citations per ratio in API responses (source/as_of).
- Methodology is fully exposable: every formula, weight, and threshold in
  code and (Phase 4) a methodology page.
- ABSENT (never fabricate): testimonials, customer logos, usage metrics,
  press, security certifications.

## Product Principles

1. Trust is the product: provenance, citations, and disclosed uncertainty
   beat polish every time they conflict.
2. Never confidently wrong: an honest "insufficient data" state outranks any
   score; nulls are first-class UI states.
3. The report is the marketing: the free diagnosis must be share-worthy.
4. Diagnosis → prescription: every problem surfaced comes with an action,
   its expected effect, and its tradeoffs.
5. RU-first bilingual: the KZ SMB owner is the design target; EN is a full
   citizen, not a stub.

## Accessibility & Inclusion

Keyboard-completable core flow; labeled inputs; status conveyed by text+dot,
not color alone [inferred from product principles; no founder-stated
standard — treat WCAG AA as the working bar].
