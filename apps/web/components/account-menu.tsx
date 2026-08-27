"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useSession, authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The header's account area: a composed two-state grammar, not a dropdown —
// signed-out gets a quiet text link ("Войти"), signed-in shows the account
// email itself (this document's own PT Mono figure-and-label idiom applies
// to identity text too, not just numbers) plus a "Мои анализы" link
// (app/[locale]/my) and a plain sign-out action.
// `isPending` renders the signed-out state rather than a loading flicker —
// Better Auth's session check is fast and cookie-based, and a page that
// briefly shows "Войти" before settling into the signed-in state reads
// better than a skeleton for something this small.
//
// Current-location marking (close-wave finish-review fix 3): both nav
// links otherwise render identically whether or not they point at the page
// the visitor is already on ("Мои анализы" on /my, "Войти" on /signin,
// both self-linking in idle ink-muted). `aria-current="page"` plus the
// world's own "current" grammar — StepIndicator's exact
// `text-brand [text-shadow:0_0_0.3em_var(--accent)]` glow, reused
// verbatim rather than inventing a second "you are here" language — marks
// it instead of suppressing the link outright, so it stays a stable,
// always-in-the-same-place target (clicking it is a harmless no-op, not a
// vanished control).
//
// Exported (not private to this module) so SiteHeader's own Pricing link
// (P6.T6) can reuse the identical current-location grammar rather than
// inventing a second copy of it — the same "reuse verbatim" discipline
// this component's own comment above describes.
export const CURRENT_LINK_CLASS = "text-brand [text-shadow:0_0_0.3em_var(--accent)]";
export const IDLE_LINK_CLASS = "text-ink-muted hover:text-ink";

export function AccountMenu() {
  const t = useTranslations("Header");
  const { data: session, isPending } = useSession();
  const pathname = usePathname();

  if (!isPending && session) {
    const onMyAnalyses = pathname === "/my";
    return (
      <div className="flex items-center gap-3">
        <span className="hidden font-mono text-xs text-ink-muted sm:inline">
          {session.user.email}
        </span>
        <Link
          href="/my"
          aria-current={onMyAnalyses ? "page" : undefined}
          className={cn(
            "rounded-sm font-mono text-xs uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            onMyAnalyses ? CURRENT_LINK_CLASS : IDLE_LINK_CLASS,
          )}
        >
          {t("myAnalyses")}
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => authClient.signOut()}
        >
          {t("signOut")}
        </Button>
      </div>
    );
  }

  const onSignIn = pathname === "/signin";
  return (
    <Link
      href="/signin"
      aria-current={onSignIn ? "page" : undefined}
      className={cn(
        "rounded-sm font-mono text-xs uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        onSignIn ? CURRENT_LINK_CLASS : IDLE_LINK_CLASS,
      )}
    >
      {t("signIn")}
    </Link>
  );
}
