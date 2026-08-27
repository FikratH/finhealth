import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest's `globals` option is off (tests import describe/it/expect
// explicitly), so Testing Library can't auto-detect `afterEach` to
// self-register its DOM cleanup — without this, one test's render leaks
// into the next test's queries within the same file.
afterEach(cleanup);

// jsdom has no layout engine and doesn't implement requestAnimationFrame —
// components that draw once on mount (e.g. ScoreDial) need it polyfilled.
if (typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (handle: number) => clearTimeout(handle);
}
