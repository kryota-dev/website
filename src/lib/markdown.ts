import {
  satteriHeadingIdsPlugin,
  type SatteriProcessorOptions,
} from "@astrojs/markdown-satteri";
import { externalLinksPlugin } from "./external-link";

/**
 * Options for the Sätteri Markdown processor (astro.config.mjs).
 *
 * - rawHtml: parse HTML written in Markdown into elements, so that an `<a>`
 *   written as HTML is also treated as an external link.
 * - Astro adds its own heading-ids plugin after these plugins, and it builds
 *   ids from the heading's text. Running a heading-ids plugin first fixes the
 *   ids before the new-tab note is added to links in headings; Astro's plugin
 *   keeps an existing id.
 */
export const markdownProcessorOptions = {
  features: { rawHtml: true },
  hastPlugins: [satteriHeadingIdsPlugin(), externalLinksPlugin],
} satisfies SatteriProcessorOptions;
