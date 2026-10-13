import type { SatteriProcessorOptions } from "@astrojs/markdown-satteri";

/**
 * Links that leave the site open in a new tab. "External" matches the ↗
 * marker in base.css: the site links to itself with relative paths, so any
 * https: URL leaves it; mailto: links stay as they are.
 */
const EXTERNAL_PREFIX = "https://";

export const EXTERNAL_LINK_TARGET = "_blank";
/** Keeps the opened page from reaching back through window.opener. */
export const EXTERNAL_LINK_REL = ["noopener", "noreferrer"] as const;
/**
 * Read after the link text, so that screen readers announce the new tab.
 * It lives here rather than in src/content because astro.config.mjs, which
 * cannot read content collections, needs it for Markdown bodies.
 */
export const NEW_TAB_NOTE = "（新しいタブで開きます）";
export const NEW_TAB_NOTE_CLASS = "visually-hidden";

export function isExternalHref(href: string): boolean {
  return href.startsWith(EXTERNAL_PREFIX);
}

/** The attributes for a link in a template: none unless it leaves the site. */
export function externalLinkAttributes(
  href: string,
): { target: string; rel: string } | Record<string, never> {
  if (!isExternalHref(href)) return {};
  return { target: EXTERNAL_LINK_TARGET, rel: EXTERNAL_LINK_REL.join(" ") };
}

/** Adds the rel values to the ones a link already has (e.g. rel="me"). */
function mergeRel(current: unknown): string[] {
  const values =
    typeof current === "string"
      ? current.split(/\s+/)
      : Array.isArray(current)
        ? current.map(String)
        : [];
  return [...new Set([...values.filter(Boolean), ...EXTERNAL_LINK_REL])];
}

type HastPlugin = NonNullable<SatteriProcessorOptions["hastPlugins"]>[number];

/**
 * The same treatment for links in Markdown bodies (a Sätteri hast plugin).
 * Use it through markdownProcessorOptions (src/lib/markdown.ts), which fixes
 * heading ids before the note is added.
 */
export const externalLinksPlugin: HastPlugin = {
  name: "external-links",
  element: {
    filter: ["a"],
    visit(node, ctx) {
      if (node.type !== "element") return;
      const { href, rel } = node.properties ?? {};
      if (typeof href !== "string" || !isExternalHref(href)) return;
      ctx.setProperty(node, "target", EXTERNAL_LINK_TARGET);
      ctx.setProperty(node, "rel", mergeRel(rel));
      ctx.appendChild(node, {
        type: "element",
        tagName: "span",
        properties: { className: [NEW_TAB_NOTE_CLASS] },
        children: [{ type: "text", value: NEW_TAB_NOTE }],
      });
    },
  },
};
