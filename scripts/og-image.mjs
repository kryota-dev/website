// @ts-check
// Generates the single OGP image (1200×630 PNG) from the Markdown content.
// Runs at the end of scripts/build.mjs, after the final build.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { create } from "fontkit";
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
const WEIGHTS = /** @type {const} */ ([400, 700]);
const PADDING = 80;
const CONTENT_WIDTH = OG_IMAGE.width - PADDING * 2;
const CONTENT_HEIGHT = OG_IMAGE.height - PADDING * 2;

/** Readable at card size (about 360px wide on phones). */
const SMALL_TEXT = 44;
const SMALL_LINE_HEIGHT = 1.4;
const FOOTER_RULE = 2;
const FOOTER_GAP = 32;
const MIN_GAP = 24;

/** The heading shrinks through these sizes until it fits; otherwise the build fails. */
const HEADING_SIZES = [80, 72, 64, 56, 48];
const HEADING_LINE_HEIGHT = 1.3;
/** Width estimate per character in em: full-width (CJK) vs. other. */
const FULL_WIDTH_EM = 1;
const NARROW_EM = 0.6;
/** Safety margin for line breaking (words and kinsoku move characters to the next line). */
const WRAP_MARGIN = 1.05;

/**
 * @typedef {object} OgText
 * @property {string} name Site name (site/index.md)
 * @property {string} byline Hero byline (hero/index.md)
 * @property {string} heading Hero heading (hero/index.md)
 */

/** @param {string} char */
const isFullWidth = (char) => (char.codePointAt(0) ?? 0) > 0x2e7f;

/** @param {string} text @param {number} size */
function estimateWidth(text, size) {
  let em = 0;
  for (const char of text) em += isFullWidth(char) ? FULL_WIDTH_EM : NARROW_EM;
  return em * size * WRAP_MARGIN;
}

/** @param {string} text @param {number} size */
const fitsOneLine = (text, size) => estimateWidth(text, size) <= CONTENT_WIDTH;

/**
 * Picks the largest heading size whose wrapped height fits between the byline
 * and the footer. Throws when even the smallest size does not fit.
 * @param {string} heading
 */
function headingSize(heading) {
  const available =
    CONTENT_HEIGHT -
    SMALL_TEXT * SMALL_LINE_HEIGHT -
    (FOOTER_GAP + FOOTER_RULE + SMALL_TEXT * SMALL_LINE_HEIGHT) -
    MIN_GAP * 2;
  for (const size of HEADING_SIZES) {
    const lines = Math.ceil(estimateWidth(heading, size) / CONTENT_WIDTH);
    if (lines * size * HEADING_LINE_HEIGHT <= available) return size;
  }
  throw new Error(
    `hero/index.md "heading" is too long for the OGP image (${[...heading].length} characters)`,
  );
}

/**
 * @param {Buffer} source
 * @param {OgText} text
 */
function assertRenderable(source, text) {
  const font = create(source);
  if (!("hasGlyphForCodePoint" in font))
    throw new Error(`${NOTO_SOURCE} is a collection`);
  for (const [field, value] of Object.entries(text)) {
    const missing = [...new Set(value)].filter(
      (char) =>
        char.trim() !== "" &&
        !font.hasGlyphForCodePoint(char.codePointAt(0) ?? 0),
    );
    if (missing.length > 0) {
      throw new Error(
        `OGP "${field}" has characters missing from ${NOTO_SOURCE}: ${missing.join(" ")}`,
      );
    }
  }
  for (const field of /** @type {const} */ (["name", "byline"])) {
    if (!fitsOneLine(text[field], SMALL_TEXT)) {
      throw new Error(
        `OGP "${field}" does not fit on one line: ${text[field]}`,
      );
    }
  }
}

/**
 * Minimal element factory for satori (it accepts React-like objects).
 * @param {string} type
 * @param {Record<string, string | number>} style
 * @param {unknown} [children]
 */
const el = (type, style, children) => ({ type, props: { style, children } });

/**
 * Renders the OGP image as PNG.
 * @param {OgText} text
 * @param {Buffer} source The original variable font (verified by the caller).
 * @returns {Promise<Buffer>}
 */
export async function renderOgImage(text, source) {
  assertRenderable(source, text);
  const size = headingSize(text.heading);
  // satori cannot read variable fonts: pin wght per weight and keep only these characters.
  const chars = Object.values(text).join("");
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
      width: CONTENT_WIDTH,
      height: CONTENT_HEIGHT,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: PADDING,
      backgroundColor: COLORS.bg,
      color: COLORS.text,
      fontFamily: FONT_FAMILY,
    },
    [
      el(
        "div",
        {
          display: "flex",
          fontSize: SMALL_TEXT,
          lineHeight: SMALL_LINE_HEIGHT,
          color: COLORS.muted,
        },
        text.byline,
      ),
      el(
        "div",
        {
          display: "flex",
          fontSize: size,
          fontWeight: 700,
          lineHeight: HEADING_LINE_HEIGHT,
        },
        text.heading,
      ),
      el(
        "div",
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: FOOTER_GAP,
          borderTop: `${FOOTER_RULE}px solid ${COLORS.border}`,
          fontSize: SMALL_TEXT,
          lineHeight: SMALL_LINE_HEIGHT,
          fontWeight: 700,
        },
        [
          el("div", { display: "flex" }, text.name),
          el("div", {
            width: 24,
            height: 24,
            borderRadius: 999,
            backgroundColor: COLORS.accent,
          }),
        ],
      ),
    ],
  );

  /** @type {Parameters<typeof satori>[0]} satori takes React-like element objects. */
  const element = /** @type {never} */ (tree);
  const svg = await satori(element, {
    width: OG_IMAGE.width,
    height: OG_IMAGE.height,
    fonts,
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: OG_IMAGE.width } })
    .render()
    .asPng();
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * @param {string} file
 * @param {string[]} keys
 * @returns {Promise<Record<string, string>>}
 */
async function readStrings(file, keys) {
  const source = await readFile(`src/content/${file}`, "utf8");
  const match = source.match(FRONTMATTER);
  if (!match) throw new Error(`${file} has no frontmatter`);
  /** @type {unknown} */
  const data = parse(match[1]);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`${file} frontmatter is not a mapping`);
  }
  /** @type {Record<string, string>} */
  const result = {};
  for (const key of keys) {
    const value = /** @type {Record<string, unknown>} */ (data)[key];
    if (typeof value !== "string" || value === "") {
      throw new Error(`${file}: expected a non-empty string for "${key}"`);
    }
    result[key] = value;
  }
  return result;
}

async function main() {
  process.chdir(fileURLToPath(new URL("..", import.meta.url)));
  const { name } = await readStrings("site/index.md", ["name"]);
  const { byline, heading } = await readStrings("hero/index.md", [
    "byline",
    "heading",
  ]);
  const source = await readFile(NOTO_SOURCE);
  verifySource(source);
  const png = await renderOgImage({ name, byline, heading }, source);
  await mkdir(dirname(OG_IMAGE.output), { recursive: true });
  await writeFile(OG_IMAGE.output, png);
  console.log(
    `OGP image: ${OG_IMAGE.output} (${(png.length / 1024).toFixed(1)} KiB)`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
