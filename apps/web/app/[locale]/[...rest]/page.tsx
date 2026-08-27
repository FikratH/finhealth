import { notFound } from "next/navigation";

// Catches every path inside a locale that doesn't match a real route
// (app/[locale]/not-found.tsx's own header comment explains why this file
// exists: a locale-level not-found.tsx alone only renders for `notFound()`
// calls made *inside* the locale segment — an address that matches no
// page at all, like /ru/does-not-exist, otherwise falls through to Next's
// unstyled framework 404 instead of this world's own. This catch-all is
// the established Next+next-intl pattern for closing that gap: match
// everything else in the segment and immediately hand off to notFound(),
// which then renders the sibling not-found.tsx.
export default function CatchAll() {
  notFound();
}
