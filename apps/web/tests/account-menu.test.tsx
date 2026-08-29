import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ruMessages from "@/messages/ru.json";

const { useSession, signOut, usePathname } = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
  usePathname: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession,
  authClient: { signOut },
}));

// Mirrors site-header.test.tsx's own pattern: mock just usePathname, keep
// the rest of "@/i18n/navigation" (Link, etc.) real.
vi.mock("@/i18n/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/i18n/navigation")>();
  return { ...actual, usePathname };
});

// Founder round 3 header redesign split this module into two pieces —
// AccountNavLink ("Мои анализы", now grouped with SiteHeader's NAV
// cluster) and AccountMenu (the ACCOUNT cluster: identity chip + "Выйти",
// or "Войти" signed-out). Each gets its own render helper below so the
// tests exercise exactly what SiteHeader actually composes, rather than a
// combined shape that no longer exists as one component.
const { AccountMenu, AccountNavLink } = await import("@/components/account-menu");

function renderMenu() {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <AccountMenu />
    </NextIntlClientProvider>,
  );
}

function renderNavLink() {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <AccountNavLink />
    </NextIntlClientProvider>,
  );
}

describe("AccountMenu (ACCOUNT cluster: identity chip + Выйти / Войти)", () => {
  beforeEach(() => {
    // A neutral route that matches neither link, unless a test overrides
    // it — keeps every pre-existing test's idle-state assertions correct
    // without each one needing to know about pathname.
    usePathname.mockReturnValue("/");
  });

  it("signed-out: shows a quiet 'Войти' link to /signin, no session UI", () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    renderMenu();

    const link = screen.getByRole("link", { name: ruMessages.Header.signIn });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/signin");
    expect(screen.queryByRole("button", { name: ruMessages.Header.signOut })).not.toBeInTheDocument();
  });

  it("while the session check is pending, renders the signed-out state rather than a loading flicker", () => {
    useSession.mockReturnValue({ data: null, isPending: true });
    renderMenu();

    expect(screen.getByRole("link", { name: ruMessages.Header.signIn })).toBeInTheDocument();
  });

  it("signed-in: shows the account email (in its bezel chip) and a 'Выйти' action, no sign-in link", () => {
    useSession.mockReturnValue({
      data: { user: { id: "u_1", email: "founder@example.com" } },
      isPending: false,
    });
    renderMenu();

    const chip = screen.getByText("founder@example.com");
    expect(chip).toBeInTheDocument();
    // The chip carries the full address via `title` — it's the thing that
    // can truncate at ~18ch, so the untruncated value must stay reachable.
    expect(chip).toHaveAttribute("title", "founder@example.com");
    expect(
      screen.getByRole("button", { name: ruMessages.Header.signOut }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: ruMessages.Header.signIn })).not.toBeInTheDocument();
  });

  it("signing out calls the Better Auth client's signOut", () => {
    useSession.mockReturnValue({
      data: { user: { id: "u_1", email: "founder@example.com" } },
      isPending: false,
    });
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: ruMessages.Header.signOut }));
    expect(signOut).toHaveBeenCalledOnce();
  });

  describe("current-location marking", () => {
    it("on /signin, signed-out: «Войти» gets aria-current=page", () => {
      usePathname.mockReturnValue("/signin");
      useSession.mockReturnValue({ data: null, isPending: false });
      renderMenu();

      const link = screen.getByRole("link", { name: ruMessages.Header.signIn });
      expect(link).toHaveAttribute("aria-current", "page");
    });

    it("NOT on /signin, signed-out: «Войти» has no aria-current", () => {
      usePathname.mockReturnValue("/");
      useSession.mockReturnValue({ data: null, isPending: false });
      renderMenu();

      const link = screen.getByRole("link", { name: ruMessages.Header.signIn });
      expect(link).not.toHaveAttribute("aria-current");
    });
  });
});

describe("AccountNavLink (NAV cluster: «Мои анализы»)", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/");
  });

  it("signed-in: shows a 'Мои анализы' link to /my", () => {
    useSession.mockReturnValue({
      data: { user: { id: "u_1", email: "founder@example.com" } },
      isPending: false,
    });
    renderNavLink();

    const link = screen.getByRole("link", { name: ruMessages.Header.myAnalyses });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/my");
  });

  it("signed-out: renders nothing", () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    const { container } = renderNavLink();

    expect(
      screen.queryByRole("link", { name: ruMessages.Header.myAnalyses }),
    ).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("while the session check is pending, renders nothing (no flicker)", () => {
    useSession.mockReturnValue({ data: null, isPending: true });
    const { container } = renderNavLink();

    expect(container).toBeEmptyDOMElement();
  });

  // Close-wave finish-review fix 3: the link previously rendered
  // identically whether or not it pointed at the current page.
  describe("current-location marking", () => {
    it("on /my, signed-in: «Мои анализы» gets aria-current=page", () => {
      usePathname.mockReturnValue("/my");
      useSession.mockReturnValue({
        data: { user: { id: "u_1", email: "founder@example.com" } },
        isPending: false,
      });
      renderNavLink();

      const link = screen.getByRole("link", { name: ruMessages.Header.myAnalyses });
      expect(link).toHaveAttribute("aria-current", "page");
    });

    it("NOT on /my, signed-in: «Мои анализы» has no aria-current", () => {
      usePathname.mockReturnValue("/analyze");
      useSession.mockReturnValue({
        data: { user: { id: "u_1", email: "founder@example.com" } },
        isPending: false,
      });
      renderNavLink();

      const link = screen.getByRole("link", { name: ruMessages.Header.myAnalyses });
      expect(link).not.toHaveAttribute("aria-current");
    });
  });
});
