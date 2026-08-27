import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IDLE_LINK_CLASS } from "@/components/nav-link-class";
import { cn } from "@/lib/utils";

export function SiteFooter() {
  const t = useTranslations("Footer");

  return (
    // Same bezel-panel treatment as SiteHeader — the console strip closing
    // the instrument, not a flush extension of the page ground.
    <footer className="border-t border-line bg-panel print:hidden">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* P6.T6: the footer's own copy of the Pricing link — no
         * current-location marking here (unlike SiteHeader's, which
         * mirrors AccountMenu's aria-current grammar): the footer has
         * never carried a "you are here" nav before, and one lone link
         * doesn't need it to stay legible. IDLE_LINK_CLASS comes from the
         * directive-free components/nav-link-class.ts (round-2 review,
         * N1) — SiteFooter is a Server Component, and importing this same
         * string from account-menu.tsx (a "use client" module, round 1's
         * fix) silently yielded a client reference instead of the actual
         * class string here. */}
        <nav className="mb-3">
          <Link
            href="/pricing"
            className={cn(
              "rounded-sm font-mono text-xs uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              IDLE_LINK_CLASS,
            )}
          >
            {t("pricing")}
          </Link>
        </nav>
        <p className="max-w-prose text-sm text-ink-muted">{t("disclaimer")}</p>
      </div>
    </footer>
  );
}
