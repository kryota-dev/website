// @ts-check
// Configuration for `pnpm test:html`, which validates the built HTML.
import { defineConfig } from "html-validate";

export default defineConfig({
  root: true,
  extends: ["html-validate:recommended"],
  rules: {
    // Safari/VoiceOver drops list semantics when list-style is none,
    // so an explicit role="list" is intentional on ul (see eslint.config.js).
    "no-redundant-role": ["error", { exclude: ["list"] }],
    // Markdown headings get ids from their text, which may start with a digit
    // ("1. ..."). The HTML standard allows that; check only what it requires.
    "valid-id": ["error", { relaxed: true }],
  },
});
