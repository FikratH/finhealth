import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));

// Same mock pattern as tests/motion-provider.test.tsx.
vi.mock("@/i18n/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/i18n/navigation")>();
  return { ...actual, usePathname };
});

// The real MotionProviderImpl (next/dynamic() over the gsap/lenis-heavy
// motion-provider.tsx) is irrelevant to what this file tests — the
// children-stability invariant review-t4-verdict.md Finding 7 is about,
// not the real provider's own effects (tests/motion-provider.test.tsx
// covers those against the real module directly, unmocked). Stubbing
// next/dynamic keeps this test fast and sidesteps the Suspense/promise-
// resolution timing a genuine dynamic import would need outside Next's own
// runtime.
vi.mock("next/dynamic", () => ({
  default: () => {
    function StubMotionProviderImpl() {
      return null;
    }
    return StubMotionProviderImpl;
  },
}));

const { MotionProvider } = await import("@/components/motion-provider-lazy");

beforeEach(() => {
  usePathname.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("MotionProvider (lazy wrapper)", () => {
  it("keeps children mounted at the same DOM node across a results <-> non-results route change (review-t4-verdict.md Finding 7)", () => {
    // Before the fix, `needsMotion` chose between two different element
    // TYPES at `children`'s own tree position (a bare fragment vs.
    // MotionProviderImpl wrapping children) — a type change at a position
    // is exactly what makes React discard the old subtree and mount a
    // fresh one there. Rendering the provider as an effects-only SIBLING
    // instead keeps `children` at a fixed position regardless of route, so
    // only the provider's own presence should ever mount/unmount — never
    // anything around it. A remounted child would be a *new* DOM node
    // instance even though the rendered markup looks identical, which is
    // exactly what `toBe` (reference equality, not just deep-equal
    // content) catches here.
    usePathname.mockReturnValue("/analyze");
    const { container, rerender } = render(
      <MotionProvider>
        <p data-testid="child">hello</p>
      </MotionProvider>,
    );
    const before = container.querySelector('[data-testid="child"]');
    expect(before).not.toBeNull();

    usePathname.mockReturnValue("/results/abc123");
    rerender(
      <MotionProvider>
        <p data-testid="child">hello</p>
      </MotionProvider>,
    );
    expect(container.querySelector('[data-testid="child"]')).toBe(before);

    usePathname.mockReturnValue("/analyze");
    rerender(
      <MotionProvider>
        <p data-testid="child">hello</p>
      </MotionProvider>,
    );
    expect(container.querySelector('[data-testid="child"]')).toBe(before);
  });
});
