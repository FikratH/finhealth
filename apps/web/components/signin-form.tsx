"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { SpecimenChip } from "@/components/specimen-chip";
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

  // The sent-state: a composed confirmation, not a toast — the form is
  // fully replaced by a bordered document-grammar panel (matching the rest
  // of the app's designed-absence idiom: an intentional state, not raw
  // success text bolted onto the same form).
  if (status === "sent") {
    return (
      <div className="border border-line bg-panel p-6 sm:p-8" role="status">
        <SpecimenChip tone="accent">{t("sentChip")}</SpecimenChip>
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
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="border border-line bg-panel p-6 sm:p-8">
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
  );
}
