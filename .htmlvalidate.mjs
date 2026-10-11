// @ts-check
// Configuration for `pnpm test:html`, which validates the built HTML.
import { defineConfig } from "html-validate";

export default defineConfig({
  root: true,
  extends: ["html-validate:recommended"],
  rules: {
    // Safari/VoiceOver drops list semantics when list-style is none,
    // so an explicit role="list" is intentional on ul/ol (see eslint.config.js).
    "no-redundant-role": ["error", { exclude: ["list"] }],
  },
});
