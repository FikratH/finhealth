import type { Metadata } from "next";

// Read once, at module scope, by everything that needs the deployed
// origin for an absolute URL: the root layout's metadataBase
// (app/[locale]/layout.tsx), app/robots.ts, and app/sitemap.ts. Unset in
// local dev — falls back to localhost, matching what .env.example and
// docs/founder-todo.md document for this var.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const SITE_NAME = "Tonus";

// The root layout's title template — Next fills %s with whatever plain
// string a page-level generateMetadata returns for `title`. Every page's
// message-file title now holds ONLY its page-specific half (e.g.
// Landing.meta.title is "Финансовая диагностика вашей компании", not
// "Tonus — финансовая диагностика вашей компании") — the brand suffix
// lives here, once, rather than hand-typed into every message string.
export const TITLE_TEMPLATE = `%s — ${SITE_NAME}`;

// The one static, branded OG/Twitter card image the whole site shares —
// see scripts/generate-og.mjs for how public/og/og-default.png is
// produced, and app/[locale]/dev/og/page.tsx for the composition it
// screenshots. 1200×630 is the conventional OG/Twitter "large image" size
// (1.91:1) both platforms expect.
const OG_IMAGE_PATH = "/og/og-default.png";
const OG_IMAGE = { url: OG_IMAGE_PATH, width: 1200, height: 630 };

// Builds the openGraph+twitter half of a launch-surface route's metadata
// from its plain title/description — landing, analyze, methodology,
// signin (and pricing once Task 6 adds the route) all wire up to the same
// branded PNG this way instead of repeating the image block per route.
// `title`/`description` are the page's own plain values: Next's
// title.template (above) only rewrites the top-level <title> tag, never
// openGraph.title/twitter.title, so those are set explicitly here to the
// same un-suffixed string — the right thing for a link-preview card to
// show ("Financial diagnosis for your company", not "… — Tonus" twice
// over).
export function pageMetadata({
  title,
  description,
  locale,
  documentTitle,
}: {
  title: string;
  description: string;
  locale: string;
  // Override for the <title> tag itself. Only needed by the landing page:
  // it shares its route segment with the layout that defines
  // TITLE_TEMPLATE, and per Next's own metadata contract, a layout's
  // title.template does NOT apply to a page.tsx in that same segment —
  // only to deeper child segments (verified empirically: without this
  // override, the landing <title> rendered with no brand suffix at all,
  // while every other route correctly got " — Tonus" appended). Every
  // other route leaves this unset and gets the template applied normally.
  documentTitle?: string;
}): Metadata {
  return {
    title: documentTitle ?? title,
    description,
    openGraph: {
      title,
      description,
      locale,
      type: "website",
      siteName: SITE_NAME,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE_PATH],
    },
  };
}
