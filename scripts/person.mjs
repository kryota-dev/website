// @ts-check
// Shared by src/components/home/Hero.astro, scripts/og-image.mjs, and the tests.

/**
 * The line under the name, e.g. "金子 凌大 / Software Engineer".
 * @param {{ alternateName: string; jobTitle: string }} person site.seo.person
 */
export const personRole = ({ alternateName, jobTitle }) =>
  `${alternateName} / ${jobTitle}`;
