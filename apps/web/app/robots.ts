import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Nothing on this site is behind a paywall or otherwise sensitive to
// crawl — allow everything. app/sitemap.ts is the file doing the real
// curation (it lists only the public, static, indexable routes; results
// pages and /my are excluded there, not here).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
