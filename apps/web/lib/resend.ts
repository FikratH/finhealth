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
const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Resend's own shared sending address — every account can use it with no
// domain setup, but Resend only *delivers* mail sent From it to the
// account owner's own inbox (a deliverability restriction on their end,
// not a bug here). Real users only receive mail once a domain is verified
// in Resend and EMAIL_FROM points at an address on it — see
// docs/founder-todo.md's SMTP entry for the verification steps.
const DEFAULT_FROM = "Tonus <onboarding@resend.dev>";

interface SendMagicLinkEmailArgs {
  email: string;
  url: string;
}

function buildEmail(url: string): { subject: string; text: string; html: string } {
  const subject = "Вход в Tonus";
  const disclaimer = "Если вы не запрашивали вход — проигнорируйте это письмо.";
  const text = `Ссылка для входа в Tonus:\n\n${url}\n\n${disclaimer}`;
  // No layout/branding claims beyond the plain link — this is a
  // single-use credential email, not marketing.
  const html =
    `<p>Ссылка для входа в Tonus:</p>` +
    `<p><a href="${url}">${url}</a></p>` +
    `<p style="color:#666;font-size:13px">${disclaimer}</p>`;
  return { subject, text, html };
}

/**
 * Sends the magic-link email via Resend. Fails closed on any error —
 * network failure or a non-2xx response both throw a generic, link-free
 * Error, and nothing this function logs ever includes the request body
 * (which contains the live sign-in URL). The caller relies on this: a
 * Resend outage must degrade to the same generic signin error surface as
 * an unconfigured transport, never to a logged or leaked link.
 */
export async function sendMagicLinkEmail({ email, url }: SendMagicLinkEmailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Defensive only — lib/auth.ts already checks this before calling in.
    throw new Error("magic_link_transport_unconfigured");
  }
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;
  const { subject, text, html } = buildEmail(url);

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
