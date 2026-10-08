// @ts-check
import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "dist/",
    ".astro/",
    ".wrangler/",
    "worker-configuration.d.ts",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs.recommended,
  astro.configs["jsx-a11y-strict"],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // Inline styles bypass Stylelint's token checks and conflict with a strict CSP.
    files: ["**/*.astro"],
    rules: {
      // Safari/VoiceOver drops list semantics when list-style is none,
      // so an explicit role="list" is intentional on ul/ol.
      "astro/jsx-a11y/no-redundant-roles": [
        "error",
        { ul: ["list"], ol: ["list"] },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='style']",
          message:
            "Use a class with design tokens instead of an inline style attribute.",
        },
      ],
    },
  },
);
