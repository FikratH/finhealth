"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useSession, authClient } from "@/lib/auth-client";
import { CURRENT_LINK_CLASS, IDLE_LINK_CLASS } from "@/components/nav-link-class";
import { cn } from "@/lib/utils";

// Header composition (founder round 3, "what a placement of header items?
// Do better!"): this module used to render one flat cluster — email text,
// "Мои анализы" link, and a stock shadcn <Button> sign-out control all in a
// row, which is exactly what read as loose debris next to the nav links'
// mono-caps register. It now splits into the two pieces SiteHeader
// composes into its own NAV/ACCOUNT/PREFS grouping:
//   - AccountNavLink: "Мои анализы" — a NAV-cluster item, grouped with
//     Pricing, not with the account identity. Signed-in only; null
//     otherwise, exactly like the old inline behavior.
//   - AccountMenu: the ACCOUNT cluster itself — signed-in shows a compact
//     bezel chip carrying the (possibly truncated) email plus "Выйти" as a
//     plain mono-caps quiet action in the SAME type system as the nav
//     links (no more shadcn Button/Inter mismatch); signed-out shows the
//     "Войти" link, unchanged from before.
// `isPending` renders the signed-out state rather than a loading flicker —
// Better Auth's session check is fast and cookie-based, and a page that
// briefly shows "Войти" before settling into the signed-in state reads
// better than a skeleton for something this small.
//
// Current-location marking (close-wave finish-review fix 3, unchanged):
// `aria-current="page"` plus the world's own "current" grammar —
// StepIndicator's exact `text-brand [text-shadow:0_0_0.3em_var(--accent)]`
// glow, reused verbatim rather than inventing a second "you are here"
// language — marks whichever nav/account link matches the current route.
// CURRENT_LINK_CLASS/IDLE_LINK_CLASS live in components/nav-link-class.ts
// (round-2 review, N1), a directive-free module, so SiteHeader's own
// Pricing link and SiteFooter's (a Server Component) can both reuse the
// identical grammar without a Server Component ever importing a named
// export across a "use client" boundary (see that file's own comment).

const NAV_LINK_CLASS =
  "rounded-sm font-mono text-xs uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** NAV-cluster item: "Мои анализы". Renders nothing signed-out or while
 * the session check is pending, matching the account identity's own
 * signed-out treatment below. */
export function AccountNavLink() {
  const t = useTranslations("Header");
  const { data: session, isPending } = useSession();
  const pathname = usePathname();

  if (isPending || !session) {
    return null;
  }

  const onMyAnalyses = pathname === "/my";
  return (
    <Link
      href="/my"
      aria-current={onMyAnalyses ? "page" : undefined}
      className={cn(NAV_LINK_CLASS, onMyAnalyses ? CURRENT_LINK_CLASS : IDLE_LINK_CLASS)}
    >
      {t("myAnalyses")}
    </Link>
  );
}

/** ACCOUNT cluster: the signed-in identity chip + "Выйти", or the
 * signed-out "Войти" link. */
export function AccountMenu() {
  const t = useTranslations("Header");
  const { data: session, isPending } = useSession();
  const pathname = usePathname();

  if (!isPending && session) {
    return (
      <div className="flex items-center gap-2">
        {/* Compact bezel chip — the same border-line/bg-panel/font-mono
         * grammar every other metadata chip in this world uses
         * (OriginTicket, InstrumentModule labels), applied to identity
         * text instead of a number. No radius, per the Shapes vocabulary
         * (bezel chips are square-cornered; only interactive controls
         * round). Truncates at ~18ch with an ellipsis rather than wrapping
         * or overflowing; `title` carries the full address for a
         * pointer/AT user who needs it. Hidden below `sm` — at a 390px
         * header the email is the one thing that can drop without losing
         * any actual capability ("Выйти" stays). */}
        <span
          title={session.user.email}
          className="hidden max-w-[18ch] truncate border border-line bg-panel px-2 py-1 font-mono text-xs text-ink-muted sm:inline-block"
        >
          {session.user.email}
        </span>
        <button
          type="button"
          onClick={() => authClient.signOut()}
          className={cn(NAV_LINK_CLASS, IDLE_LINK_CLASS)}
        >
          {t("signOut")}
        </button>
      </div>
    );
  }

  const onSignIn = pathname === "/signin";
  return (
    <Link
      href="/signin"
      aria-current={onSignIn ? "page" : undefined}
      className={cn(NAV_LINK_CLASS, onSignIn ? CURRENT_LINK_CLASS : IDLE_LINK_CLASS)}
    >
      {t("signIn")}
    </Link>
  );
}
