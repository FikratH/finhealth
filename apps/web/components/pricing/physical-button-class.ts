// The landing hero's literal physical-button CTA class string (DESIGN.md's
// Buttons section: "the landing CTA — a literal physical button" —
// border-2 border-brand bg-panel, a lit-LED glow that dims on :active),
// duplicated from landing/hero.tsx rather than pulled into a shared
// component — that file itself keeps the classes inline instead of behind
// an abstraction, so this matches that precedent rather than introducing a
// new one.
//
// Lives in its own module (not re-exported from pricing-tiers.tsx, which
// was the round-1 review's first-draft location) because pricing-tiers.tsx
// itself imports WaitlistForm — re-exporting from there would make
// WaitlistForm import back from its own parent, a circular import for no
// reason beyond convenience.
export const PHYSICAL_BUTTON_CLASS =
  "h-auto w-full border-2 border-brand bg-panel px-8 py-3.5 font-mono text-sm uppercase tracking-wide text-brand shadow-[0_0_16px_2px_color-mix(in_oklch,var(--accent)_40%,transparent)] hover:bg-brand/10 hover:shadow-[0_0_20px_3px_color-mix(in_oklch,var(--accent)_50%,transparent)] active:shadow-[0_0_8px_1px_color-mix(in_oklch,var(--accent)_40%,transparent)] focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper sm:w-auto";
