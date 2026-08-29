// Resend HTTP transport for magic-link email (fix round 2 — the founder now
// has a Resend API key; see lib/auth.ts's own header comment for the full
// fail-closed story this sits inside of). Plain `fetch` against Resend's
// REST API, no SDK/npm dependency — the API is a single JSON POST, not
// worth a package for.
//
// This module is ONLY ever called from lib/auth.ts's `sendMagicLink`, and
// only on the branch that already confirmed `NODE_ENV === "production"` and
// `RESEND_API_KEY` is set — dev keeps the console transport unconditionally
// (deterministic local testing; tests/e2e/auth.spec.ts and
// tests/auth-token-route.test.ts both depend on that log line existing).
//
// Founder round 3 ("do you think this looks like a professional enterprise
// [email]?"): buildEmail rebuilt as a table-based, inline-styled HTML
// document — email clients strip <style> blocks unreliably and never fetch
// external stylesheets/web fonts, so every rule here is inline and every
// font is a system stack. One fixed light layout (email clients default
// light; dark-mode media queries are unreliable across clients, so this
// deliberately doesn't attempt a second register the way the app itself
// does). The logo is the founder's hosted teal wordmark PNG — the same
// asset served from public/brand/logo-teal.png in this app, referenced by
// its production URL since email clients cannot resolve a relative path.
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const LOGO_URL = "https://tonusai.vercel.app/brand/logo-teal.png";

// Resend's own shared sending address — every account can use it with no
// domain setup, but Resend only *delivers* mail sent From it to the
// account owner's own inbox (a deliverability restriction on their end,
// not a bug here). Real users only receive mail once a domain is verified
// in Resend and EMAIL_FROM points at an address on it — see
// docs/founder-todo.md's SMTP entry for the verification steps.
const DEFAULT_FROM = "Tonus <onboarding@resend.dev>";

export type EmailLocale = "ru" | "en";

interface SendMagicLinkEmailArgs {
  email: string;
  url: string;
  /** Defaults to "ru" — every existing caller (dev transport, tests) that
   * predates locale-awareness stays on the original Russian copy. */
  locale?: EmailLocale;
}

interface EmailCopy {
  subject: string;
  preheader: string;
  eyebrow: string;
  headline: string;
  body: string;
  button: string;
  fallbackLabel: string;
  disclaimer: string;
  footerTagline: string;
}

// Per-locale copy. RU keeps the exact subject/disclaimer wording the
// original single-locale email shipped with (tests/callers pinned to it);
// EN is the founder-requested new register for /en sign-ins.
const COPY: Record<EmailLocale, EmailCopy> = {
  ru: {
    subject: "Вход в Tonus",
    preheader: "Ссылка для входа в ваш аккаунт Tonus",
    eyebrow: "ОДНОРАЗОВАЯ ССЫЛКА",
    headline: "Вход в Tonus",
    body: "Нажмите на кнопку ниже, чтобы войти в аккаунт. Ссылка одноразовая и действует ограниченное время.",
    button: "Войти в Tonus",
    fallbackLabel: "Если кнопка не работает, скопируйте и вставьте эту ссылку в браузер:",
    disclaimer: "Если вы не запрашивали вход — проигнорируйте это письмо.",
    footerTagline: "Tonus — финансовая диагностика компании",
  },
  en: {
    subject: "Sign in to Tonus",
    preheader: "Your sign-in link for Tonus",
    eyebrow: "ONE-TIME LINK",
    headline: "Sign in to Tonus",
    body: "Click the button below to sign in to your account. This link is single-use and expires shortly.",
    button: "Sign in to Tonus",
    fallbackLabel: "If the button doesn't work, copy and paste this link into your browser:",
    disclaimer: "If you didn't request this, you can safely ignore this email.",
    footerTagline: "Tonus — financial diagnostics for your company",
  },
};

const SYSTEM_SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SYSTEM_MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

// The world's own "darker paper-register teal" (app/globals.css's `.paper`
// theme accent, #0e7569) rather than the screen-register brand teal
// (#19c2b0) — computed contrast: white text on #0e7569 is ~5.6:1 (passes
// WCAG AA), white text on #19c2b0 is only ~2.2:1 (fails). A light email
// background needs the darker variant for the button to hold up as real
// button contrast, not a decorative wash.
const BUTTON_BG = "#0e7569";
const BUTTON_TEXT = "#ffffff";
const INK = "#101418"; // headline/body text on the light email background
const INK_MUTED = "#6b7280"; // footer/disclaimer text — ~4.8:1 on white, still AA
const LINE = "#e5e7eb"; // hairline borders on the light layout
const CARD_BG = "#ffffff";
const PAGE_BG = "#f1f3f4";

function renderHtml(copy: EmailCopy, url: string): string {
  return `<!doctype html>
<html lang="${copy === COPY.en ? "en" : "ru"}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${copy.subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${PAGE_BG};">
    <!-- Preheader: hidden preview text, never rendered visibly. -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
      ${copy.preheader}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAGE_BG};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${CARD_BG};border:1px solid ${LINE};border-radius:8px;">
            <tr>
              <td align="center" style="padding:36px 40px 8px 40px;">
                <img
                  src="${LOGO_URL}"
                  alt="Tonus"
                  width="140"
                  style="display:block;width:140px;max-width:140px;height:auto;border:0;outline:none;text-decoration:none;"
                />
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 40px 0 40px;">
                <span style="display:inline-block;border:1px solid ${BUTTON_BG};padding:4px 10px;font-family:${SYSTEM_MONO};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BUTTON_BG};">
                  ${copy.eyebrow}
                </span>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:16px 40px 0 40px;font-family:${SYSTEM_SANS};font-size:22px;line-height:1.3;font-weight:700;color:${INK};">
                ${copy.headline}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:12px 40px 0 40px;font-family:${SYSTEM_SANS};font-size:14px;line-height:1.6;color:${INK_MUTED};">
                ${copy.body}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:28px 40px 0 40px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="${BUTTON_BG}" style="border-radius:8px;">
                      <a
                        href="${url}"
                        target="_blank"
                        style="display:inline-block;padding:14px 32px;font-family:${SYSTEM_MONO};font-size:13px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${BUTTON_TEXT};text-decoration:none;border-radius:8px;"
                        >${copy.button}</a
                      >
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 40px 0 40px;font-family:${SYSTEM_SANS};font-size:12px;line-height:1.5;color:${INK_MUTED};">
                ${copy.fallbackLabel}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:6px 40px 0 40px;font-family:${SYSTEM_MONO};font-size:12px;line-height:1.6;word-break:break-all;color:${BUTTON_BG};">
                <a href="${url}" target="_blank" style="color:${BUTTON_BG};text-decoration:underline;">${url}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px 0 40px;">
                <div style="border-top:1px solid ${LINE};"></div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:16px 40px 32px 40px;font-family:${SYSTEM_MONO};font-size:11px;line-height:1.6;letter-spacing:0.01em;color:${INK_MUTED};">
                ${copy.footerTagline} &middot; ${copy.disclaimer}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildEmail(
  url: string,
  locale: EmailLocale = "ru",
): { subject: string; text: string; html: string } {
  const copy = COPY[locale] ?? COPY.ru;
  const text = `${copy.headline}\n\n${copy.body}\n\n${url}\n\n${copy.disclaimer}`;
  return { subject: copy.subject, text, html: renderHtml(copy, url) };
}

/**
 * Sends the magic-link email via Resend. Fails closed on any error —
 * network failure or a non-2xx response both throw a generic, link-free
 * Error, and nothing this function logs ever includes the request body
 * (which contains the live sign-in URL). The caller relies on this: a
 * Resend outage must degrade to the same generic signin error surface as
 * an unconfigured transport, never to a logged or leaked link.
 */
export async function sendMagicLinkEmail({
  email,
  url,
  locale,
}: SendMagicLinkEmailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Defensive only — lib/auth.ts already checks this before calling in.
    throw new Error("magic_link_transport_unconfigured");
  }
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;
  const { subject, text, html } = buildEmail(url, locale);

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: email, subject, text, html }),
      // A hung Resend API must not hang the user's signin POST — abort
      // after 10s. AbortError lands in the bare catch below, which already
      // fails closed without referencing the caught error.
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Network-level failure (DNS, TLS, timeout, ...). Log only that it
    // happened — never the caught error object itself, which some fetch
    // implementations attach the failed request (including its body, the
    // link) to.
    console.error("MAGIC_LINK_SEND_FAILED: network error contacting Resend");
    throw new Error("magic_link_send_failed");
  }

  if (!response.ok) {
    // Enough to correlate with Resend's own dashboard/support without ever
    // logging our request body (the link) or trusting their response body
    // enough to print it verbatim.
    const requestId = response.headers.get("x-request-id");
    console.error(
      `MAGIC_LINK_SEND_FAILED: Resend responded ${response.status}` +
        (requestId ? ` (request-id: ${requestId})` : ""),
    );
    throw new Error("magic_link_send_failed");
  }
}
