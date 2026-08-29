// Unit tests for lib/resend.ts in isolation — no Better Auth, no server
// instance. See tests/auth-magic-link-production.test.ts for the
// integration-level assertions (which branch lib/auth.ts's sendMagicLink
// takes, through a real Better Auth call).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendMagicLinkEmail } from "@/lib/resend";

const EMAIL = "reader@example.com";
const MAGIC_URL = "http://localhost:3100/auth/token?token=super-secret-single-use-token";

// Same fetch-mock shape as tests/api-auth-header.test.ts.
function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
  } as unknown as Response;
}

describe("lib/resend.ts — sendMagicLinkEmail", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "test-resend-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("POSTs to Resend with the right auth header and a RU email carrying the link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { id: "email_123" })));

    await sendMagicLinkEmail({ email: EMAIL, url: MAGIC_URL });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("Bearer test-resend-key");
    expect(headers.get("Content-Type")).toBe("application/json");

    const body = JSON.parse(String(init?.body));
    expect(body.from).toBe("Tonus <onboarding@resend.dev>");
    expect(body.to).toBe(EMAIL);
    expect(body.subject).toBe("Вход в Tonus");
    expect(body.text).toContain(MAGIC_URL);
    expect(body.html).toContain(MAGIC_URL);
    // No invented branding claims — a plain-text disclaimer line only.
    expect(body.text).toContain("Если вы не запрашивали вход");
  });

  it("uses EMAIL_FROM when set, instead of the Resend shared address", async () => {
    vi.stubEnv("EMAIL_FROM", "Tonus <noreply@tonusai.com>");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { id: "email_123" })));

    await sendMagicLinkEmail({ email: EMAIL, url: MAGIC_URL });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.from).toBe("Tonus <noreply@tonusai.com>");
  });

  it("throws without calling Resend when RESEND_API_KEY is unset", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    delete process.env.RESEND_API_KEY;
    vi.stubGlobal("fetch", vi.fn());

    await expect(sendMagicLinkEmail({ email: EMAIL, url: MAGIC_URL })).rejects.toThrow(
      "magic_link_transport_unconfigured",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed on a non-2xx Resend response, logging status/request-id but never the link", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(422, { message: "invalid `to` field" }, { "x-request-id": "req_abc123" }),
        ),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sendMagicLinkEmail({ email: EMAIL, url: MAGIC_URL })).rejects.toThrow(
      "magic_link_send_failed",
    );

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls[0].map(String).join(" ");
    expect(logged).toContain("422");
    expect(logged).toContain("req_abc123");
    expect(logged).not.toContain(MAGIC_URL);
  });

  it("fails closed on a network error, logging nothing link-bearing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sendMagicLinkEmail({ email: EMAIL, url: MAGIC_URL })).rejects.toThrow(
      "magic_link_send_failed",
    );

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls[0].map(String).join(" ");
    expect(logged).not.toContain(MAGIC_URL);
  });
});
