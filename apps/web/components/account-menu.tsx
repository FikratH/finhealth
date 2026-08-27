"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSession, authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

// The header's account area: a composed two-state grammar, not a dropdown —
// signed-out gets a quiet text link ("Войти"), signed-in shows the account
// email itself (this document's own PT Mono figure-and-label idiom applies
// to identity text too, not just numbers) plus a plain sign-out action.
// `isPending` renders the signed-out state rather than a loading flicker —
// Better Auth's session check is fast and cookie-based, and a page that
// briefly shows "Войти" before settling into the signed-in state reads
// better than a skeleton for something this small.
export function AccountMenu() {
  const t = useTranslations("Header");
  const { data: session, isPending } = useSession();

  if (!isPending && session) {
    return (
      <div className="flex items-center gap-3">
        <span className="hidden font-mono text-xs text-ink-muted sm:inline">
          {session.user.email}
        </span>
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

  return (
    <Link
      href="/signin"
      className="rounded-sm font-mono text-xs uppercase tracking-wide text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {t("signIn")}
    </Link>
  );
}
