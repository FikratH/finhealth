import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ruMessages from "@/messages/ru.json";

const { useSession, signOut } = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession,
  authClient: { signOut },
}));

const { AccountMenu } = await import("@/components/account-menu");

function renderMenu() {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <AccountMenu />
    </NextIntlClientProvider>,
  );
}

describe("AccountMenu", () => {
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

  it("signed-in: shows the account email and a 'Выйти' action, no sign-in link", () => {
    useSession.mockReturnValue({
      data: { user: { id: "u_1", email: "founder@example.com" } },
      isPending: false,
    });
    renderMenu();

    expect(screen.getByText("founder@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: ruMessages.Header.signOut }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: ruMessages.Header.signIn })).not.toBeInTheDocument();
  });

  it("signed-in: shows a 'Мои анализы' link to /my", () => {
    useSession.mockReturnValue({
      data: { user: { id: "u_1", email: "founder@example.com" } },
      isPending: false,
    });
    renderMenu();

    const link = screen.getByRole("link", { name: ruMessages.Header.myAnalyses });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/my");
  });

  it("signed-out: no 'Мои анализы' link", () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    renderMenu();

    expect(
      screen.queryByRole("link", { name: ruMessages.Header.myAnalyses }),
    ).not.toBeInTheDocument();
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
});
