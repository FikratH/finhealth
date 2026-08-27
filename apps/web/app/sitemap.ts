import type { MetadataRoute } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/seo";

// Public, crawlable, static routes only. Every URL below is computed
// through next-intl's own getPathname() so the as-needed locale-prefix
// rule (ru bare, en under /en — i18n/routing.ts) can never drift from
// what the app actually serves.
//
// Deliberately EXCLUDED:
// - /results/[id] — a per-analysis share link, unlisted by design: it's a
//   real company's diagnosis, not marketing content meant to be indexed
//   (the same posture that keeps its OG description digit-free — see
//   app/[locale]/results/[id]/page.tsx's generateMetadata comment). There
//   is also no finite list of ids to enumerate here.
// - /my — behind auth; an anonymous crawler has nothing to index there.
const STATIC_ROUTES = ["/", "/analyze", "/methodology", "/signin", "/pricing"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return STATIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${getPathname({ href: route, locale: routing.defaultLocale })}`,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [
          locale,
          `${SITE_URL}${getPathname({ href: route, locale })}`,
        ]),
      ),
    },
  }));
}
