// Renders the committed visual-world contract as a literal HTML comment,
// first inside <body>. Source of truth (verbatim):
// .superpowers/sdd/2026-08-27-plan-3-frontend-foundation/design-direction.md
// React has no first-class way to emit a bare comment node, so this wraps it
// in a `display: contents` element, which takes no box of its own.
const CONTRACT = `<!--
THESIS: A company's financial diagnosis rendered as a modern laboratory
report — reference intervals, specimen labels, a stamped conclusion —
refusing the fintech dashboard-of-cards default.
OWN-WORLD: Paper #FBFAF7, ink #1A1D1C, hairline rules, clinical teal #0E7569
committed at region scale; STIX Two Text display, Inter UI, PT Mono figures;
grid-paper grounds; lab-flag status triad with symbols.
STORY: An SMB owner uploads statements, verifies the extracted numbers, and
understands their company's health well enough to act on three priorities.
FIRST VIEWPORT (landing): full-width teal header band with wordmark «Тонус»;
left column — one-line offer + primary action «Проверить компанию»; right —
a life-size fragment of a real (demo-labeled) report showing a metric with
its норма-band and flag. No screenshots-in-browser-frames, no logo walls.
FORM: Laboratory results document, #1 of grounded list; seed f356f7c9; confirmed by founder in attended round (pick).
FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying
its provenance.
-->`;

export function DirectionContract() {
  return (
    <div
      style={{ display: "contents" }}
      dangerouslySetInnerHTML={{ __html: CONTRACT }}
    />
  );
}
