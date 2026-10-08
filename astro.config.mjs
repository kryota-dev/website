// @ts-check
import { existsSync } from "node:fs";
import cloudflare from "@astrojs/cloudflare";
import { defineConfig, fontProviders } from "astro/config";
import { FONT_PASS, NOTO_SOURCE, NOTO_SUBSET } from "./scripts/font-paths.mjs";

/**
 * The final build serves the subset made by scripts/subset-fonts.mjs; the
 * collect pass and `astro dev` use the original file.
 */
function notoSource() {
  if (FONT_PASS !== "final") return NOTO_SOURCE;
  if (!existsSync(NOTO_SUBSET)) {
    throw new Error(
      `${NOTO_SUBSET} is missing; it is created by \`pnpm build\`.`,
    );
  }
  return NOTO_SUBSET;
}

/**
 * Builds must go through `pnpm build` (scripts/build.mjs), which regenerates
 * the subset; a bare `astro build` would ship a stale subset or the 9.6 MB source.
 * @type {import("astro").AstroIntegration}
 */
const requireTwoPassBuild = {
  name: "require-two-pass-build",
  hooks: {
    "astro:config:setup": ({ command }) => {
      if (command === "build" && FONT_PASS === undefined) {
        throw new Error(
          "Run `pnpm build` (two-pass font build) instead of `astro build`.",
        );
      }
    },
  },
};

/** IBM Plex Mono, Latin only, from the @fontsource package (no network). */
const plexMono = (/** @type {400 | 500} */ weight) => ({
  src: /** @type {[string]} */ ([
    `@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-${weight}-normal.woff2`,
  ]),
  weight,
  style: /** @type {const} */ ("normal"),
});

// https://astro.build/config
export default defineConfig({
  site: "https://kryota.dev",
  // Static site: no sessions, and images are optimized at build time,
  // so the adapter does not add SESSION (KV) or IMAGES bindings.
  session: false,
  adapter: cloudflare({ imageService: "compile" }),
  integrations: [requireTwoPassBuild],
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Noto Sans JP",
      cssVariable: "--font-noto-sans-jp",
      // Astro tunes the metrics of the last (generic) fallback.
      fallbacks: ["Hiragino Sans", "Yu Gothic UI", "sans-serif"],
      options: {
        variants: [{ src: [notoSource()], weight: "100 900", style: "normal" }],
      },
    },
    {
      provider: fontProviders.local(),
      name: "IBM Plex Mono",
      cssVariable: "--font-ibm-plex-mono",
      fallbacks: ["ui-monospace", "monospace"],
      options: { variants: [plexMono(400), plexMono(500)] },
    },
  ],
});
