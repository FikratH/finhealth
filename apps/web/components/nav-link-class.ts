// The header/footer "current-location" link grammar: `aria-current="page"`
// plus this pair of classes — StepIndicator's exact current-step glow,
// reused verbatim rather than inventing a second "you are here" language
// (see account-menu.tsx's own header comment for the fuller history).
//
// Lives in its own directive-free module (no "use client"/"use server") —
// NOT exported from account-menu.tsx, even though that's where this
// grammar originated. account-menu.tsx IS a Client Component ("use client"
// at its top); a Server Component importing a named export from a Client
// Component module receives a client REFERENCE for it, not the actual
// value. SiteFooter (a Server Component) imported IDLE_LINK_CLASS from
// account-menu.tsx exactly that way in round 1, and cn() silently dropped
// the non-string reference — the prerendered footer link lost
// text-ink-muted/hover on every page, invisible to jsdom (which doesn't
// enforce the RSC boundary), the build, and the existing e2e assertions
// (round-2 review, N1). A plain module with no directive has no such
// boundary: Next bundles it into whichever graph (server or client) each
// importer belongs to, so account-menu.tsx, site-header.tsx (both client),
// and site-footer.tsx (server) all get the real string either way.
export const CURRENT_LINK_CLASS = "text-brand [text-shadow:0_0_0.3em_var(--accent)]";
export const IDLE_LINK_CLASS = "text-ink-muted hover:text-ink";
