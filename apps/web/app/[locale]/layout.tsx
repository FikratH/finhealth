import type { ReactNode } from "react";
import { Inter, PT_Mono, STIX_Two_Text } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { ThemeProvider } from "@/components/theme-provider";
import { MotionProvider } from "@/components/motion-provider";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { DirectionContract } from "@/components/direction-contract";
import "../globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

const stixTwoText = STIX_Two_Text({
  subsets: ["latin", "cyrillic"],
  variable: "--font-stix-two-text",
  display: "swap",
});

const ptMono = PT_Mono({
  subsets: ["latin", "cyrillic"],
  weight: "400",
  variable: "--font-pt-mono",
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
    title: t("wordmark"),
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
      className={`${inter.variable} ${stixTwoText.variable} ${ptMono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col antialiased">
        <DirectionContract />
        <NextIntlClientProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <MotionProvider>
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
