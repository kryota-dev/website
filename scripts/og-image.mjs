// @ts-check
// Generates the single OGP image (1200×630 PNG) from the Markdown content.
// Runs at the end of scripts/build.mjs, after the final build.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import subsetFont from "subset-font";
import { parse } from "yaml";
import { NOTO_SOURCE } from "./font-paths.mjs";
import { OG_IMAGE } from "./og-settings.mjs";
import { verifySource } from "./subset-fonts.mjs";

/** Light theme tokens (keep in sync with src/styles/tokens.css). */
const COLORS = {
  bg: "#f6f3ea",
  text: "#1f1d19",
  muted: "#5b574e",
  accent: "#2b7350",
  border: "#ddd6c6",
};

const FONT_FAMILY = "Noto Sans JP";
const PADDING = 80;
const WEIGHTS = /** @type {const} */ ([400, 700]);
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * @param {string} file
 * @returns {Promise<Record<string, unknown>>}
 */
async function readFrontmatter(file) {
  const source = await readFile(`src/content/${file}`, "utf8");
  const match = source.match(FRONTMATTER);
  if (!match) throw new Error(`${file} has no frontmatter`);
  return parse(match[1]);
}

/** @param {Record<string, unknown>} data @param {string} key */
function text(data, key) {
  const value = data[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`Expected a non-empty string for "${key}"`);
  }
  return value;
}

/**
 * Minimal element factory for satori (it accepts React-like objects).
 * @param {string} type
 * @param {Record<string, unknown>} style
 * @param {unknown} [children]
 */
const el = (type, style, children) => ({ type, props: { style, children } });

async function main() {
  process.chdir(fileURLToPath(new URL("..", import.meta.url)));
  const site = await readFrontmatter("site/index.md");
  const hero = await readFrontmatter("hero/index.md");
  const name = text(site, "name");
  const byline = text(hero, "byline");
  const heading = text(hero, "heading");

  const source = await readFile(NOTO_SOURCE);
  verifySource(source);
  // satori cannot read variable fonts: pin wght per weight and keep only these characters.
  const chars = `${name}${byline}${heading}`;
  const fonts = await Promise.all(
    WEIGHTS.map(async (weight) => ({
      name: FONT_FAMILY,
      weight,
      style: /** @type {const} */ ("normal"),
      data: await subsetFont(source, chars, {
        targetFormat: "sfnt",
        variationAxes: { wght: weight },
      }),
    })),
  );

  const tree = el(
    "div",
    {
      // satori adds padding outside width/height (content-box).
      width: OG_IMAGE.width - PADDING * 2,
      height: OG_IMAGE.height - PADDING * 2,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: PADDING,
      backgroundColor: COLORS.bg,
      color: COLORS.text,
      fontFamily: FONT_FAMILY,
    },
    [
      el("div", { display: "flex", fontSize: 28, color: COLORS.muted }, byline),
      el(
        "div",
        { display: "flex", fontSize: 80, fontWeight: 700, lineHeight: 1.3 },
        heading,
      ),
      el(
        "div",
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 32,
          borderTop: `2px solid ${COLORS.border}`,
          fontSize: 32,
          fontWeight: 700,
        },
        [
          el("div", { display: "flex" }, name),
          el("div", {
            width: 20,
            height: 20,
            borderRadius: 999,
            backgroundColor: COLORS.accent,
          }),
        ],
      ),
    ],
  );

  const svg = await satori(/** @type {any} */ (tree), {
    width: OG_IMAGE.width,
    height: OG_IMAGE.height,
    fonts,
  });
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: OG_IMAGE.width },
  })
    .render()
    .asPng();
  await mkdir(dirname(OG_IMAGE.output), { recursive: true });
  await writeFile(OG_IMAGE.output, png);
  console.log(
    `OGP image: ${OG_IMAGE.output} (${(png.length / 1024).toFixed(1)} KiB)`,
  );
}

await main();
