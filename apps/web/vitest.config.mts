import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    server: {
      deps: {
        // next-intl is ESM-only and imports from "next/navigation" without
        // an extension; Vitest needs to process it (not externalize it) to
        // resolve that, per next-intl's testing docs — only relevant once a
        // component under test uses createNavigation's Link/useRouter/etc.
        inline: ["next-intl"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
