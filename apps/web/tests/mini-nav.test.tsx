import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { MiniNav, type MiniNavItem } from "@/components/results/mini-nav";
import ruMessages from "@/messages/ru.json";

const { getLenis } = vi.hoisted(() => ({ getLenis: vi.fn() }));

// MiniNav calls into MotionProvider's Lenis accessor to decide whether a
// click should smooth-scroll or fall through to the native #id anchor
// jump — mock just that export, same pattern as tests/site-header.test.tsx
// mocking a single named export of a larger module.
vi.mock("@/components/motion-provider", () => ({ getLenis }));

const ITEMS: MiniNavItem[] = [
  { id: "score", label: "Заключение" },
  { id: "categories", label: "Категории" },
  { id: "ratios", label: "Коэффициенты" },
];

function renderNav(activeId: string | null) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <MiniNav items={ITEMS} activeId={activeId} />
    </NextIntlClientProvider>,
  );
}

function getNav() {
  return screen.getByRole("navigation", { name: ruMessages.Results.nav.railLabel });
}

describe("MiniNav", () => {
  it("renders every section anchor, all fully legible at once — the always-lit discipline, never dimmed dots revealed on hover", () => {
    renderNav("categories");

    const links = within(getNav()).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(
      expect.arrayContaining(["Заключение", "Категории", "Коэффициенты"]),
    );
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link).toBeVisible();
    }
  });

  it("marks exactly the active item with aria-current, and none of the others", () => {
    renderNav("ratios");

    const active = within(getNav()).getByRole("link", { name: "Коэффициенты" });
    expect(active).toHaveAttribute("aria-current", "true");

    for (const label of ["Заключение", "Категории"]) {
      const link = within(getNav()).getByRole("link", { name: label });
      expect(link).not.toHaveAttribute("aria-current");
    }
  });

  it("marks nothing as current when activeId matches no item", () => {
    renderNav(null);

    const links = within(getNav()).getAllByRole("link");
    expect(links.every((link) => !link.hasAttribute("aria-current"))).toBe(true);
  });

  it("renders every anchor as a real href — clicking still works with zero JS", () => {
    renderNav("score");

    expect(within(getNav()).getByRole("link", { name: "Категории" })).toHaveAttribute(
      "href",
      "#categories",
    );
  });

  it("when Lenis is active, clicking calls lenis.scrollTo with the target element and prevents the native jump", () => {
    const scrollTo = vi.fn();
    getLenis.mockReturnValue({ scrollTo });

    const target = document.createElement("div");
    target.id = "ratios";
    document.body.appendChild(target);

    renderNav("score");
    const link = within(getNav()).getByRole("link", { name: "Коэффициенты" });
    const notPrevented = fireEvent.click(link);

    expect(scrollTo).toHaveBeenCalledWith(target);
    expect(notPrevented).toBe(false); // fireEvent returns false when preventDefault() was called

    document.body.removeChild(target);
    getLenis.mockReset();
  });

  it("when no Lenis is active (reduced motion, or before mount), clicking does not intervene — the native #id anchor jump proceeds", () => {
    getLenis.mockReturnValue(null);

    renderNav("score");
    const link = within(getNav()).getByRole("link", { name: "Категории" });
    const notPrevented = fireEvent.click(link);

    expect(notPrevented).toBe(true); // never called preventDefault — native anchor behavior is untouched

    getLenis.mockReset();
  });

  it("renders nothing when given no items", () => {
    const { container } = render(
      <NextIntlClientProvider locale="ru" messages={ruMessages}>
        <MiniNav items={[]} activeId={null} />
      </NextIntlClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
