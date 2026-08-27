import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Metadata } from "next";
import ruMessages from "@/messages/ru.json";
import enMessages from "@/messages/en.json";

// Same next-intl/server stand-in as tests/results-metadata.test.ts: real
// messages/{ru,en}.json content behind a fake getTranslations, so these
// assertions check the copy that actually ships rather than a fixture.
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const messages = locale === "en" ? enMessages : ruMessages;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ns = namespace.split(".").reduce((obj: any, key) => obj[key], messages as any);
    return (key: string, values?: Record<string, unknown>) => {
      let str: string = ns[key];
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          str = str.replaceAll(`{${k}}`, String(v));
        }
      }
      return str;
    };
  },
  setRequestLocale: vi.fn(),
}));

describe("lib/seo — title template + shared OG image", () => {
  it("TITLE_TEMPLATE suffixes the brand with exactly one substitution point", async () => {
    const { TITLE_TEMPLATE, SITE_NAME } = await import("@/lib/seo");
    expect(TITLE_TEMPLATE).toBe(`%s — ${SITE_NAME}`);
    expect(TITLE_TEMPLATE.split("%s")).toHaveLength(2);
  });

  it("SITE_URL falls back to localhost when NEXT_PUBLIC_SITE_URL is unset", async () => {
    const { SITE_URL } = await import("@/lib/seo");
    expect(SITE_URL).toBe(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
  });

  it("pageMetadata wires openGraph and twitter to the committed OG PNG at 1200×630", async () => {
    const { pageMetadata } = await import("@/lib/seo");
    const metadata = pageMetadata({ title: "X", description: "Y", locale: "ru" });

    expect(metadata.openGraph?.images).toEqual([
      { url: "/og/og-default.png", width: 1200, height: 630 },
    ]);
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "X",
      description: "Y",
      images: ["/og/og-default.png"],
    });
  });
});

describe("Per-route generateMetadata — plain page title, brand suffix left to the template", () => {
  const LOCALES = ["ru", "en"] as const;
  type RouteModule = {
    generateMetadata: (props: { params: Promise<{ locale: string }> }) => Promise<Metadata>;
  };
  const ROUTES: Array<{
    name: string;
    namespace: string;
    load: () => Promise<RouteModule>;
    // Landing shares its route segment with app/[locale]/layout.tsx, so
    // per Next's own contract the layout's title.template does NOT reach
    // it (only deeper child segments) — its <title> has to spell out the
    // brand suffix itself (see lib/seo.ts's documentTitle doc comment).
    // Every other route here is a child segment and gets the template
    // applied externally, so its raw generateMetadata title stays bare.
    expectedDocumentTitle: (rawTitle: string) => string;
  }> = [
    {
      name: "Landing",
      namespace: "Landing.meta",
      load: () => import("@/app/[locale]/page"),
      expectedDocumentTitle: (rawTitle) => `${rawTitle} — Tonus`,
    },
    {
      name: "Analyze",
      namespace: "Analyze.meta",
      load: () => import("@/app/[locale]/analyze/page"),
      expectedDocumentTitle: (rawTitle) => rawTitle,
    },
    {
      name: "Methodology",
      namespace: "Methodology.meta",
      load: () => import("@/app/[locale]/methodology/page"),
      expectedDocumentTitle: (rawTitle) => rawTitle,
    },
    {
      name: "SignIn",
      namespace: "SignIn.meta",
      load: () => import("@/app/[locale]/signin/page"),
      expectedDocumentTitle: (rawTitle) => rawTitle,
    },
  ];

  beforeEach(() => {
    vi.resetModules();
  });

  for (const route of ROUTES) {
    for (const locale of LOCALES) {
      it(`${route.name} (${locale}): <title> resolves correctly for its segment, OG/twitter title stays unsuffixed and wired to the shared PNG`, async () => {
        const messages = locale === "en" ? enMessages : ruMessages;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ns = route.namespace.split(".").reduce((obj: any, key) => obj[key], messages as any);
        const { generateMetadata } = await route.load();

        const metadata = await generateMetadata({ params: Promise.resolve({ locale }) });

        expect(metadata.title).toBe(route.expectedDocumentTitle(ns.title));
        // Guards the double-brand regression on every child-segment route:
        // the root layout's title template ("%s — Tonus") appends the
        // brand once, so a page-level title must never already carry its
        // own "Tonus" prefix (Landing is deliberately exempt — see above).
        if (route.name !== "Landing") {
          expect(String(metadata.title).startsWith("Tonus")).toBe(false);
        }
        expect(metadata.description).toBe(ns.description);
        // openGraph/twitter titles are never run through title.template —
        // they stay the page's own plain string on every route, Landing
        // included, so a shared link's preview card never doubles the
        // brand either.
        expect(metadata.openGraph?.title).toBe(ns.title);
        expect(metadata.twitter?.title).toBe(ns.title);
        expect(metadata.openGraph?.images).toEqual([
          { url: "/og/og-default.png", width: 1200, height: 630 },
        ]);
        expect(metadata.twitter?.images).toEqual(["/og/og-default.png"]);
      });
    }
  }
});

describe("app/sitemap.ts — static routes only, /results and /my excluded", () => {
  it("lists exactly the four public static routes in both locales, never a /results or /my URL", async () => {
    const { SITE_URL } = await import("@/lib/seo");
    const { default: sitemap } = await import("@/app/sitemap");
    const entries = sitemap();

    const allUrls: string[] = entries
      .flatMap((entry) => [entry.url, ...Object.values(entry.alternates?.languages ?? {})])
      .filter((url): url is string => Boolean(url));

    expect(allUrls.some((url) => url.includes("/results"))).toBe(false);
    expect(allUrls.some((url) => url.includes("/my"))).toBe(false);
    expect(allUrls.some((url) => url.includes("/pricing"))).toBe(false);

    // ru is the default, prefix-free locale (as-needed); en sits under /en.
    expect(allUrls).toContain(`${SITE_URL}/`);
    expect(allUrls).toContain(`${SITE_URL}/en`);
    expect(allUrls).toContain(`${SITE_URL}/analyze`);
    expect(allUrls).toContain(`${SITE_URL}/en/analyze`);
    expect(allUrls).toContain(`${SITE_URL}/methodology`);
    expect(allUrls).toContain(`${SITE_URL}/en/methodology`);
    expect(allUrls).toContain(`${SITE_URL}/signin`);
    expect(allUrls).toContain(`${SITE_URL}/en/signin`);
    expect(entries).toHaveLength(4);
  });
});

describe("app/robots.ts — allow all, references the sitemap", () => {
  it("allows every path and points at the sitemap under SITE_URL", async () => {
    const { SITE_URL } = await import("@/lib/seo");
    const { default: robots } = await import("@/app/robots");
    const result = robots();

    expect(result.rules).toMatchObject({ userAgent: "*", allow: "/" });
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
