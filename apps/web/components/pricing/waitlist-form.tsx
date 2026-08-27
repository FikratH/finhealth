"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { joinWaitlist } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { AnnunciatorCell } from "@/components/annunciator-cell";
import { PHYSICAL_BUTTON_CLASS } from "@/components/pricing/physical-button-class";
import { cn } from "@/lib/utils";

// Deliberately permissive — this only gates the request, never claims to
// validate deliverability; the backend's EmailStr is the real check.
// Mirrors signin-form.tsx's own EMAIL_PATTERN verbatim.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "pending" | "joined" | "already_joined" | "error";

// Pro's CTA (P6.T6): a bezel email field + the landing hero's literal
// physical-button idiom (border-2 border-brand bg-panel, lit-LED glow that
// dims on :active — DESIGN.md's Buttons section, duplicated here rather
// than extracted since hero.tsx itself keeps the classes inline, not in a
// shared component). Terminal states (success AND the honest duplicate
// case) both replace the form outright with an AnnunciatorCell — the same
// "composed panel, not a toast" discipline signin-form.tsx's own sent-state
// uses — status "good" either way: being on the waitlist is not a bad
// outcome even when it was already true before this submission, only the
// label/description differ.
export function WaitlistForm() {
  const t = useTranslations("Pricing.pro");
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
    try {
      const result = await joinWaitlist(email);
      setStatus(result.status);
    } catch {
      setStatus("error");
    }
  }

  if (status === "joined" || status === "already_joined") {
    const joined = status === "joined";
    return (
      // role="status" (not a bezel of its own — AnnunciatorCell below
      // already IS the one bezel; wrapping it in a second `border
      // border-line bg-panel` frame would be the "nested cards"
      // anti-pattern the craft floor bans): a live region so the whole
      // subtree is announced the moment it replaces the form — round-1
      // review finding (F2), the form's earlier version swapped the DOM
      // silently, with nothing to tell a screen-reader user that
      // submitting actually did anything. The headline above the cell
      // mirrors SigninForm's own sent-state shape (chip/headline/
      // description) and gives the live region an immediate opening line.
      <div role="status">
        <p className="font-display text-xl text-ink">
          {joined ? t("successTitle") : t("alreadyTitle")}
        </p>
        <AnnunciatorCell
          className="mt-4"
          status="good"
          label={joined ? t("successChip") : t("alreadyChip")}
          description={joined ? t("successDescription", { email }) : t("alreadyDescription")}
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label
        htmlFor={emailId}
        className="block font-mono text-xs uppercase tracking-wide text-ink-muted"
      >
        {t("formLabel")}
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
        placeholder={t("formPlaceholder")}
        aria-invalid={Boolean(validationError)}
        aria-describedby={validationError ? emailErrorId : undefined}
        className={cn(
          // Celebrated-editability grammar, same discipline as
          // SigninForm's own email field.
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

      <Button
        type="submit"
        disabled={status === "pending"}
        className={cn("mt-4", PHYSICAL_BUTTON_CLASS)}
      >
        {status === "pending" ? t("submitPending") : t("submitButton")}
      </Button>
    </form>
  );
}
