import type { ReactNode } from "react";
import { Inter, PT_Mono, STIX_Two_Text } from "next/font/google";
import localFont from "next/font/local";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { ThemeProvider } from "@/components/theme-provider";
import { MotionProvider } from "@/components/motion-provider-lazy";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { DirectionContract } from "@/components/direction-contract";
import { AuthBootstrap } from "@/components/auth-bootstrap";
import { SITE_URL, TITLE_TEMPLATE } from "@/lib/seo";
import "../globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

// Print-only since the Monitor redesign (globals.css's @theme inline pins
// --font-display to Inter on screen; only the @media print block pins it
// back to STIX) — no screen route ever renders text in this face anymore,
// so it no longer earns a <link rel="preload"> on every route's initial
// response. `preload: false` drops that eager fetch; the @font-face itself
// still exists and loads on demand the moment a print stylesheet actually
// needs it (print preview / Ctrl+P on the results document).
const stixTwoText = STIX_Two_Text({
  subsets: ["latin", "cyrillic"],
  variable: "--font-stix-two-text",
  display: "swap",
  preload: false,
});

const ptMono = PT_Mono({
  subsets: ["latin", "cyrillic"],
  weight: "400",
  variable: "--font-pt-mono",
  display: "swap",
});

// The instrument's big-figure voice for STATIC (non-igniting) segment
// figures — animated ignition draws its own CSS mask instead (see
// SegmentDisplay). Vendored, not loaded from Google: DSEG7 "classic" 700,
// from the @fontsource/dseg7@4.5.4 npm package (DSEG font v0.46 by
// keshikan, https://github.com/keshikan/DSEG), SIL Open Font License 1.1 —
// license text at ./fonts/DSEG-LICENSE.txt, copied verbatim from the
// upstream repo at build time of this task.
const dseg7 = localFont({
  src: "../fonts/dseg7-classic-700-normal.woff2",
  weight: "700",
  variable: "--font-dseg7",
  display: "swap",
});

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Omit<LocaleLayoutProps, "children">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Header" });

  return {
    // Lets every URL-based field below this layout (openGraph.images,
    // sitemap/robots — see lib/seo.ts) use a relative path instead of a
    // required absolute URL.
    metadataBase: new URL(SITE_URL),
    title: {
      template: TITLE_TEMPLATE,
      // Only used when a child route defines no title of its own at all
      // (the /dev/* routes, the 404) — not run through its own template,
      // per Next's title-resolution contract, so this stays bare "Tonus"
      // rather than "Tonus — Tonus".
      default: t("wordmark"),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${stixTwoText.variable} ${ptMono.variable} ${dseg7.variable} h-full`}
    >
      <body className="flex min-h-full flex-col antialiased">
        <DirectionContract />
        <NextIntlClientProvider>
          {/* Monitor is the default register (defaultTheme="dark"); the
           * existing light/dark/system toggle now switches monitor↔paper.
           * `value` remaps next-themes' theme *names* to distinct classes —
           * "dark" still gets the "dark" class (unchanged), "light" now
           * gets "paper" instead of no class — so the world's default
           * register lives on bare :root (no class needed), matching the
           * direction's "monitor default on :root, paper under .paper
           * theme class." See globals.css's top-of-file comment for the
           * full rationale and the `dark:` Tailwind-utility audit. */}
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            value={{ light: "paper", dark: "dark" }}
          >
            <MotionProvider>
              <AuthBootstrap />
              <SiteHeader />
              <main className="flex-1">{children}</main>
              <SiteFooter />
            </MotionProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
