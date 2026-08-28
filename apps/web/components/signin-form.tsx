"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { OriginTicket } from "@/components/origin-ticket";
import { cn } from "@/lib/utils";

export interface SigninFormProps {
  /** Server-computed (env vars are never readable client-side) — the
   * Google button is absent entirely, not disabled, when this is false. */
  googleEnabled: boolean;
}

// Deliberately permissive — this only gates the request, never claims to
// validate deliverability; Better Auth's own endpoint is the real check.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "pending" | "sent" | "error";

export function SigninForm({ googleEnabled }: SigninFormProps) {
  const t = useTranslations("SignIn");
  const emailId = useId();
  const emailErrorId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!EMAIL_PATTERN.test(email)) {
      setValidationError(t("emailInvalid"));
      return;
    }
    setValidationError(null);
    setStatus("pending");
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/" });
    setStatus(error ? "error" : "sent");
  }

  // Robust live region (P7 T1b): a screen reader only reliably announces a
  // live region's content changing if the region itself was already present
  // — registered in the accessibility tree — before the change happens.
  // Popping a brand-new role="status" element into existence with its
  // content already inside it (the previous shape here) is exactly the
  // "mounts with its content" case that isn't guaranteed to announce. So
  // this div is unconditionally in the tree from first render, empty until
  // "sent", never unmounted afterward — only its children swap. The visual
  // replacement (form disappears, panel appears) is unchanged: the form
  // still renders conditionally, right beside this region, and the region
  // only picks up the bordered document-grammar panel look once it actually
  // has something to show.
  const sent = status === "sent";

  return (
    <>
      {!sent && (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="border border-line bg-panel p-6 sm:p-8"
        >
          <label
            htmlFor={emailId}
            className="block font-mono text-xs uppercase tracking-wide text-ink-muted"
          >
            {t("emailLabel")}
          </label>
          <input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setValidationError(null);
            }}
            placeholder={t("emailPlaceholder")}
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? emailErrorId : undefined}
            className={cn(
              // Celebrated-editability grammar, same discipline as ValueInput/
              // DocumentControls' currency field: brand-teal border + a low-
              // spread glow on focus, not the pale --accent-surface wash.
              "mt-2 w-full border bg-panel px-3 py-2 font-mono text-sm text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              validationError
                ? "border-critical"
                : "border-line focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_color-mix(in_oklch,var(--accent)_20%,transparent)]",
            )}
          />
          {validationError && (
            <p id={emailErrorId} role="alert" className="mt-2 text-xs text-critical">
              {validationError}
            </p>
          )}
          {status === "error" && (
            <p role="alert" className="mt-2 text-xs text-critical">
              {t("genericError")}
            </p>
          )}

          <Button type="submit" className="mt-4" disabled={status === "pending"}>
            {status === "pending" ? t("submitPending") : t("submitButton")}
          </Button>

          {googleEnabled && (
            <>
              <div
                className="mt-6 flex items-center gap-3 font-mono text-xs uppercase tracking-wide text-ink-muted"
                aria-hidden="true"
              >
                <span className="h-px flex-1 bg-line" />
                {t("orDivider")}
                <span className="h-px flex-1 bg-line" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-6 w-full"
                onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/" })}
              >
                {t("googleButton")}
              </Button>
            </>
          )}
        </form>
      )}

      <div role="status" className={sent ? "border border-line bg-panel p-6 sm:p-8" : undefined}>
        {sent && (
          <>
            <OriginTicket tone="accent">{t("sentChip")}</OriginTicket>
            <p className="mt-4 font-display text-xl text-ink">{t("sentTitle")}</p>
            <p className="mt-2 text-sm text-ink-muted">{t("sentDescription", { email })}</p>
            <p className="mt-4 text-xs text-ink-muted">{t("sentHint")}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-6"
              onClick={() => setStatus("idle")}
            >
              {t("resendButton")}
            </Button>
          </>
        )}
      </div>
    </>
  );
}
