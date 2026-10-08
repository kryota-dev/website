// @ts-check
import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://kryota.dev",
  // Static site: no sessions, and images are optimized at build time,
  // so the adapter does not add SESSION (KV) or IMAGES bindings.
  session: false,
  adapter: cloudflare({ imageService: "compile" }),
});
