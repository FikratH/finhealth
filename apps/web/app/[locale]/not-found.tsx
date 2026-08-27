import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

// The site-wide 404 — catches every `notFound()` call inside the locale
// segment that doesn't have a more specific not-found.tsx of its own
// (results/[id]/not-found.tsx stays the specific one for an unknown
// analysis id), plus every genuinely unmatched path via the
// app/[locale]/[...rest] catch-all page next to this file. Same
// designed-absence grammar as that results-scoped sibling: na tone
// (ghost-cell-texture, ink-muted middle-dot glyph, no glow) rather than
// error.tsx's critical red — a 404 isn't a failure, it's an honest "not
// lit here" reading, the same idiom SegmentDisplay/StatusPill use for a
// null value. No eyebrow above the heading (craft floor ban); the heading
// carries its own weight.
export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <div className="ghost-cell-texture border border-line bg-panel p-10 text-center">
        <p aria-hidden="true" className="font-mono text-3xl leading-none text-ink-muted">
          ·
        </p>
        <h1 className="mt-4 font-display text-3xl text-ink">{t("title")}</h1>
        <p className="mt-4 text-ink-muted">{t("body")}</p>
        <Button asChild className="mt-6">
          <Link href="/">{t("cta")}</Link>
        </Button>
      </div>
    </div>
  );
}
