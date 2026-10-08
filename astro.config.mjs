// @ts-check
import { existsSync } from "node:fs";
import cloudflare from "@astrojs/cloudflare";
import { defineConfig, fontProviders } from "astro/config";
import {
  COLLECT_PASS,
  NOTO_SOURCE,
  NOTO_SUBSET,
} from "./scripts/font-paths.mjs";

const isBuild = process.argv.includes("build");

/**
 * The served Japanese font is the subset made by scripts/subset-fonts.mjs.
 * The collect pass and `astro dev` use the original file instead.
 */
function notoSource() {
  if (!isBuild || COLLECT_PASS) return NOTO_SOURCE;
  if (!existsSync(NOTO_SUBSET)) {
    throw new Error(
      `${NOTO_SUBSET} is missing. Run \`pnpm build\` (two-pass build) instead of \`astro build\`.`,
    );
  }
  return NOTO_SUBSET;
}

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
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Noto Sans JP",
      cssVariable: "--font-noto-sans-jp",
      fallbacks: ["sans-serif"],
      options: {
        variants: [{ src: [notoSource()], weight: "100 900", style: "normal" }],
      },
    },
    {
      provider: fontProviders.local(),
      name: "IBM Plex Mono",
      cssVariable: "--font-ibm-plex-mono",
      fallbacks: ["monospace"],
      options: {
        variants: [plexMono(400), plexMono(500)],
      },
    },
  ],
});
