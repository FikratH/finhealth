import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ruMessages from "@/messages/ru.json";

const { magicLink, social } = vi.hoisted(() => ({
  magicLink: vi.fn(),
  social: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { magicLink, social } },
}));

const { SigninForm } = await import("@/components/signin-form");

function renderForm(googleEnabled = false) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <SigninForm googleEnabled={googleEnabled} />
    </NextIntlClientProvider>,
  );
}

describe("SigninForm", () => {
  it("rejects an obviously invalid email without calling the API, and never renders the sent state", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(ruMessages.SignIn.emailLabel), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: ruMessages.SignIn.submitButton }));

    expect(await screen.findByText(ruMessages.SignIn.emailInvalid)).toBeInTheDocument();
    expect(magicLink).not.toHaveBeenCalled();
    expect(screen.queryByText(ruMessages.SignIn.sentTitle)).not.toBeInTheDocument();
  });

  it("submits a valid email and shows the composed sent-state confirmation with the email echoed back", async () => {
    magicLink.mockResolvedValue({ data: { status: true }, error: null });
    renderForm();

    fireEvent.change(screen.getByLabelText(ruMessages.SignIn.emailLabel), {
      target: { value: "founder@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: ruMessages.SignIn.submitButton }));

    expect(await screen.findByText(ruMessages.SignIn.sentTitle)).toBeInTheDocument();
    expect(
      screen.getByText(
        ruMessages.SignIn.sentDescription.replace("{email}", "founder@example.com"),
      ),
    ).toBeInTheDocument();
    expect(magicLink).toHaveBeenCalledWith({ email: "founder@example.com", callbackURL: "/" });
    // The form itself is gone — a composed replacement, not an inline toast.
    expect(screen.queryByLabelText(ruMessages.SignIn.emailLabel)).not.toBeInTheDocument();
  });

  it("shows a visible retryable error when Better Auth's endpoint returns an error, and keeps the form", async () => {
    magicLink.mockResolvedValue({ data: null, error: { message: "rate limited" } });
    renderForm();

    fireEvent.change(screen.getByLabelText(ruMessages.SignIn.emailLabel), {
      target: { value: "founder@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: ruMessages.SignIn.submitButton }));

    expect(await screen.findByText(ruMessages.SignIn.genericError)).toBeInTheDocument();
    expect(screen.getByLabelText(ruMessages.SignIn.emailLabel)).toBeInTheDocument();
  });

  it("omits the Google button when not configured", () => {
    renderForm(false);
    expect(
      screen.queryByRole("button", { name: ruMessages.SignIn.googleButton }),
    ).not.toBeInTheDocument();
  });

  it("shows the Google button when configured, and it starts a social sign-in", () => {
    renderForm(true);
    const button = screen.getByRole("button", { name: ruMessages.SignIn.googleButton });
    fireEvent.click(button);
    expect(social).toHaveBeenCalledWith({ provider: "google", callbackURL: "/" });
  });
});
