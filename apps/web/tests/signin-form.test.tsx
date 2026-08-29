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

function renderForm(googleEnabled = false, locale = "ru") {
  return render(
    <NextIntlClientProvider locale={locale} messages={ruMessages}>
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
    // metadata.locale (founder round 3) threads the page's own locale
    // through to lib/auth.ts's sendMagicLink callback, which uses it to
    // pick the email's language — see lib/resend.ts for the two copies.
    expect(magicLink).toHaveBeenCalledWith({
      email: "founder@example.com",
      callbackURL: "/",
      metadata: { locale: "ru" },
    });
    // The form itself is gone — a composed replacement, not an inline toast.
    expect(screen.queryByLabelText(ruMessages.SignIn.emailLabel)).not.toBeInTheDocument();
  });

  it("threads the current locale through as metadata.locale on an /en signin", async () => {
    magicLink.mockResolvedValue({ data: { status: true }, error: null });
    renderForm(false, "en");

    fireEvent.change(screen.getByLabelText(ruMessages.SignIn.emailLabel), {
      target: { value: "founder@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: ruMessages.SignIn.submitButton }));

    await screen.findByText(ruMessages.SignIn.sentTitle);
    expect(magicLink).toHaveBeenCalledWith({
      email: "founder@example.com",
      callbackURL: "/",
      metadata: { locale: "en" },
    });
  });

  it("P7 T1b: the role=status live region is present from first render, not just once sent — the more reliable shape for AT announcements", () => {
    renderForm();

    const region = screen.getByRole("status");
    expect(region).toBeInTheDocument();
    expect(region).toBeEmptyDOMElement();
  });

  it("P7 T1b: the same live region node (not a new one) gains the confirmation content once sent", async () => {
    magicLink.mockResolvedValue({ data: { status: true }, error: null });
    renderForm();

    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();

    fireEvent.change(screen.getByLabelText(ruMessages.SignIn.emailLabel), {
      target: { value: "founder@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: ruMessages.SignIn.submitButton }));

    await screen.findByText(ruMessages.SignIn.sentTitle);
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent(ruMessages.SignIn.sentTitle);
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
