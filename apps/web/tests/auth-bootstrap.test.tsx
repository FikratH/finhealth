import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));
const { getApiToken, clearCachedApiToken } = vi.hoisted(() => ({
  getApiToken: vi.fn(),
  clearCachedApiToken: vi.fn(),
}));
const { setTokenProvider } = vi.hoisted(() => ({ setTokenProvider: vi.fn() }));

vi.mock("@/lib/auth-client", () => ({ useSession }));
vi.mock("@/lib/api-token", () => ({ getApiToken, clearCachedApiToken }));
vi.mock("@/lib/api", () => ({ setTokenProvider }));

const { AuthBootstrap } = await import("@/components/auth-bootstrap");

// The wiring seam itself: a session existing (or not) must translate into
// lib/api.ts's tokenProvider being registered (or cleared) — the actual
// header-attachment behavior this drives is covered end to end by
// tests/api-auth-header.test.ts against the real lib/api.ts.
describe("AuthBootstrap", () => {
  it("registers getApiToken as the token provider once a session exists", () => {
    useSession.mockReturnValue({ data: { user: { id: "u_1", email: "a@b.com" } } });
    render(<AuthBootstrap />);
    expect(setTokenProvider).toHaveBeenCalledWith(getApiToken);
  });

  it("clears the provider and any cached token when there is no session", () => {
    useSession.mockReturnValue({ data: null });
    render(<AuthBootstrap />);
    expect(setTokenProvider).toHaveBeenCalledWith(null);
    expect(clearCachedApiToken).toHaveBeenCalledOnce();
  });

  it("renders nothing", () => {
    useSession.mockReturnValue({ data: null });
    const { container } = render(<AuthBootstrap />);
    expect(container).toBeEmptyDOMElement();
  });
});
