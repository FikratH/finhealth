// Renders the committed visual-world contract as a literal HTML comment,
// first inside <body>. Source of truth (verbatim — copied from that file's
// own "Direction contract (embed as FIRST child of <body> in root layout,
// verbatim)" section, not hand-edited here):
// .superpowers/sdd/redesign-monitor/design-direction.md
// React has no first-class way to emit a bare comment node, so this wraps it
// in a `display: contents` element, which takes no box of its own.
//
// NOTE: this FIRST VIEWPORT line still describes "Tonus" igniting segment
// by segment — the source document's own text as of this copy. The R2
// scope addendum (founder-uploaded brand assets) later superseded that for
// the actual hero, which now reveals the real logo via a scanline wipe
// instead (see landing/logo-reveal.tsx). Kept verbatim per instruction
// rather than silently edited out of sync with the source; the source
// document itself should be the one to update if this contract is meant to
// track the shipped hero exactly.
const CONTRACT = `<!--
THESIS: A company's financial diagnosis as a vital-signs monitor — segment
displays whose unlit cells make honesty visible — refusing both the paper
report's quietness and the fintech dashboard default.
OWN-WORLD: Near-black #0A0C0E instrument ground, bezel panels, teal #19C2B0
brand LED with a green/amber/red status triad at full saturation, ghost
segments for absence; segment-mask figures, PT Mono caps labels, Inter
prose; boot-grammar motion (sequenced instant ignitions, scanline sweeps).
STORY: An SMB owner watches their company power on: uploads statements,
verifies the readings, and reads the monitor well enough to act on three
priorities.
FIRST VIEWPORT (landing): full-bleed monitor; "Tonus" ignites segment by
segment; beneath it one live demo instrument module (net margin 4.58% with
calibration scale and green LED) and one physical-button CTA «Проверить
компанию». No dashboards-in-frames, no logo walls.
FORM: Seven-segment instrument family; bolder-register re-roll winner; seed
f356f7c9 / reroll 1 / key 5aeddcfe.
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
