"use client";

import { useEffect } from "react";
import { routing } from "@/i18n/routing";

// The root error boundary — Next's last resort when something throws
// above or outside the locale layout itself (a bad root-layout render, a
// build-manifest/chunk-loading failure, or any error the locale-scoped
// app/[locale]/*/error.tsx files never got a chance to catch). Per Next's
// own docs this file replaces <html>/<body> outright and does not inherit
// app/globals.css, so none of this world's Tailwind utilities or CSS
// custom properties are guaranteed to be loaded — every value below is a
// literal hex pulled straight from DESIGN.md's token table (each one
// commented with the token it stands in for) rather than a `var(--x)`
// reference or a `bg-panel`/`text-critical` class. `routing.ts` is safe to
// import here (pure config, no next-intl request-scoped APIs), so the
// document's own `lang` at least matches the product's RU-first default;
// next-intl itself — messages, useTranslations — is unavailable this far
// outside the locale layout, so both languages are hardcoded inline below
// instead of a locale-keyed lookup.
//
// Same real-failure grammar as every locale-scoped error.tsx (critical
// red, not the 404 pages' na/ink-muted designed-absence tone) — a root
// crash is an actual failure, never an honest absence.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang={routing.defaultLocale} style={{ height: "100%" }}>
      <body
        style={{
          height: "100%",
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily: "Inter, system-ui, sans-serif", // --font-display / --font-body fallback chain
          backgroundColor: "#0a0c0e", // --paper
          color: "#e6edf0", // --ink
        }}
      >
        <div
          role="alert"
          style={{
            width: "100%",
            maxWidth: "36rem",
            border: "1px solid #ff4a3a", // --critical
            backgroundColor: "#101418", // --panel
            padding: "2.5rem",
            textAlign: "center",
          }}
        >
          <p
            aria-hidden="true"
            style={{
              margin: 0,
              fontFamily: "ui-monospace, monospace", // --font-label fallback chain
              fontSize: "1.875rem",
              lineHeight: 1,
              color: "#ff4a3a", // --critical
              textShadow: "0 0 0.3em #ff4a3a", // the annunciator glow, same device as error.tsx
            }}
          >
            ✕
          </p>
          <h1 style={{ marginTop: "1rem", fontSize: "1.5rem", fontWeight: 400 }}>
            Что-то пошло не так / Something went wrong
          </h1>
          <p style={{ marginTop: "1rem", color: "#7c8a92" /* --ink-muted */ }}>
            Мы не смогли загрузить страницу. Обновите её или вернитесь позже.
          </p>
          <p style={{ marginTop: "0.25rem", color: "#7c8a92" /* --ink-muted */ }}>
            We couldn&apos;t load the page. Reload it or try again later.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: "1.5rem",
              border: "none",
              borderRadius: "0.5rem", // --rounded-lg
              padding: "0.5rem 1.25rem",
              fontFamily: "inherit",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#0a0c0e", // --primary-foreground (--paper)
              backgroundColor: "#19c2b0", // --primary (--accent)
              cursor: "pointer",
            }}
          >
            Обновить / Reload
          </button>
        </div>
      </body>
    </html>
  );
}
