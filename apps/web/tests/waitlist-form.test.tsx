import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ruMessages from "@/messages/ru.json";
import { ApiError } from "@/lib/api";

const { joinWaitlist } = vi.hoisted(() => ({ joinWaitlist: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, joinWaitlist };
});

const { WaitlistForm } = await import("@/components/pricing/waitlist-form");

function renderForm() {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <WaitlistForm />
    </NextIntlClientProvider>,
  );
}

const pro = ruMessages.Pricing.pro;

describe("WaitlistForm", () => {
  it("rejects an obviously invalid email without calling the API", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(pro.formLabel), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: pro.submitButton }));

    expect(await screen.findByText(pro.emailInvalid)).toBeInTheDocument();
    expect(joinWaitlist).not.toHaveBeenCalled();
  });

  it("submits a valid email and shows the composed annunciator confirmation on a fresh signup", async () => {
    joinWaitlist.mockResolvedValue({ status: "joined" });
    renderForm();

    fireEvent.change(screen.getByLabelText(pro.formLabel), {
      target: { value: "founder@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: pro.submitButton }));

    expect(await screen.findByText(pro.successChip)).toBeInTheDocument();
    expect(joinWaitlist).toHaveBeenCalledWith("founder@example.com");
    // The form itself is gone — a composed replacement, same discipline as
    // SigninForm's sent-state.
    expect(screen.queryByLabelText(pro.formLabel)).not.toBeInTheDocument();
  });

  it("round-1 fix (F2): the success confirmation is a role=status live region with a headline, so a screen reader is actually told something happened", async () => {
    joinWaitlist.mockResolvedValue({ status: "joined" });
    renderForm();

    fireEvent.change(screen.getByLabelText(pro.formLabel), {
      target: { value: "founder@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: pro.submitButton }));

    const region = await screen.findByRole("status");
    expect(region).toHaveTextContent(pro.successTitle);
    expect(region).toHaveTextContent(pro.successChip);
  });

  it("shows the honest \"already on the list\" confirmation on a duplicate — not an error", async () => {
    joinWaitlist.mockResolvedValue({ status: "already_joined" });
    renderForm();

    fireEvent.change(screen.getByLabelText(pro.formLabel), {
      target: { value: "dupe@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: pro.submitButton }));

    expect(await screen.findByText(pro.alreadyChip)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("round-1 fix (F2): the duplicate confirmation is also a role=status live region with its own honest headline", async () => {
    joinWaitlist.mockResolvedValue({ status: "already_joined" });
    renderForm();

    fireEvent.change(screen.getByLabelText(pro.formLabel), {
      target: { value: "dupe@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: pro.submitButton }));

    const region = await screen.findByRole("status");
    expect(region).toHaveTextContent(pro.alreadyTitle);
    expect(region).toHaveTextContent(pro.alreadyChip);
  });

  it("shows a visible retryable error when the API call fails, and keeps the form", async () => {
    joinWaitlist.mockRejectedValue(new ApiError(429, "rate_limited"));
    renderForm();

    fireEvent.change(screen.getByLabelText(pro.formLabel), {
      target: { value: "founder@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: pro.submitButton }));

    expect(await screen.findByText(pro.genericError)).toBeInTheDocument();
    expect(screen.getByLabelText(pro.formLabel)).toBeInTheDocument();
  });
});
