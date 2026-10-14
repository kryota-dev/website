// @ts-check
// Generates the single OGP image (1200×630 PNG) from the Markdown content
// and the avatar. Runs at the end of scripts/build.mjs, after the final build.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { create } from "fontkit";
import satori from "satori";
import subsetFont from "subset-font";
import { parse } from "yaml";
import { NOTO_SOURCE } from "./font-paths.mjs";
import { AVATAR_BG, AVATAR_SOURCE } from "./icon-settings.mjs";
import { OG_IMAGE } from "./og-settings.mjs";
import { personRole } from "./person.mjs";
import { verifySource } from "./subset-fonts.mjs";

/** Light theme tokens (keep in sync with src/styles/tokens.css). */
const COLORS = {
  bg: "#f6f3ea",
  text: "#1f1d19",
  muted: "#5b574e",
  border: "#ddd6c6",
};

const FONT_FAMILY = "Noto Sans JP";
const WEIGHTS = /** @type {const} */ ([400, 700]);
const PADDING = 80;
const CONTENT_WIDTH = OG_IMAGE.width - PADDING * 2;
const CONTENT_HEIGHT = OG_IMAGE.height - PADDING * 2;

/** The avatar circle on the right, and the gap to the text on its left. */
const AVATAR_SIZE = 260;
const AVATAR_GAP = 64;
const TEXT_WIDTH = CONTENT_WIDTH - AVATAR_SIZE - AVATAR_GAP;

/** Readable at card size (about 360px wide on phones). */
const SMALL_TEXT = 44;
const SMALL_LINE_HEIGHT = 1.4;
/** The role line sits beside the avatar, so it is a little smaller. */
const ROLE_TEXT = 36;
const ROLE_GAP = 16;
const FOOTER_RULE = 2;
const FOOTER_GAP = 32;

/** The name shrinks through these sizes until it fits on one line; otherwise the build fails. */
export const NAME_SIZES = [96, 88, 80, 72, 64, 56, 48];
const NAME_LINE_HEIGHT = 1.2;
/** Room for satori's rounding and kerning against the measured width. */
const FIT_MARGIN = 1.02;
/** Text widths available to the name and the role, and to the site name. */
export const OG_TEXT_WIDTH = TEXT_WIDTH;
export const OG_CONTENT_WIDTH = CONTENT_WIDTH;

/**
 * @typedef {object} OgText
 * @property {string} site Site name (site/index.md "name")
 * @property {string} name The person's name (site.seo.person.name)
 * @property {string} role The line under the name (see scripts/person.mjs)
 */

/**
 * Measures text with the font's own advances at the given weight.
 * @param {import("fontkit").Font} font
 * @param {string} text
 * @param {number} size
 * @param {number} weight
 */
function measure(font, text, size, weight) {
  const face = font.getVariation({ wght: weight });
  return (face.layout(text).advanceWidth / face.unitsPerEm) * size * FIT_MARGIN;
}

/**
 * Checks the text against the font and the layout, and picks the largest
 * name size that fits on one line beside the avatar. Throws when a glyph is
 * missing or any line does not fit.
 * @param {OgText} text
 * @param {Buffer} source
 * @returns {{ nameSize: number }}
 */
export function layoutText(text, source) {
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
  if (measure(font, text.role, ROLE_TEXT, 400) > TEXT_WIDTH) {
    throw new Error(`OGP "role" does not fit beside the avatar: ${text.role}`);
  }
  if (measure(font, text.site, SMALL_TEXT, 700) > CONTENT_WIDTH) {
    throw new Error(`OGP "site" does not fit on one line: ${text.site}`);
  }
  const nameSize = NAME_SIZES.find(
    (size) => measure(font, text.name, size, 400) <= TEXT_WIDTH,
  );
  if (nameSize === undefined) {
    throw new Error(
      `site.seo.person "name" is too long for the OGP image (${[...text.name].length} characters)`,
    );
  }
  return { nameSize };
}

/**
 * Minimal element factory for satori (it accepts React-like objects).
 * @param {string} type
 * @param {Record<string, string | number>} style
 * @param {unknown} [children]
 * @param {Record<string, string | number>} [props]
 */
const el = (type, style, children, props = {}) => ({
  type,
  props: { ...props, style, children },
});

/**
 * Renders the OGP image as PNG.
 * @param {OgText} text
 * @param {Buffer} source The original variable font (verified by the caller).
 * @param {Buffer} avatar The avatar PNG (transparent background).
 * @returns {Promise<Buffer>}
 */
export async function renderOgImage(text, source, avatar) {
  const { nameSize: size } = layoutText(text, source);
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
          alignItems: "center",
          justifyContent: "space-between",
          flexGrow: 1,
        },
        [
          el(
            "div",
            { display: "flex", flexDirection: "column", width: TEXT_WIDTH },
            [
              el(
                "div",
                {
                  display: "flex",
                  fontSize: size,
                  // The same weight as the hero heading on the site.
                  fontWeight: 400,
                  lineHeight: NAME_LINE_HEIGHT,
                },
                text.name,
              ),
              el(
                "div",
                {
                  display: "flex",
                  marginTop: ROLE_GAP,
                  fontSize: ROLE_TEXT,
                  lineHeight: SMALL_LINE_HEIGHT,
                  color: COLORS.muted,
                },
                text.role,
              ),
            ],
          ),
          el(
            "div",
            {
              display: "flex",
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              overflow: "hidden",
              borderRadius: AVATAR_SIZE / 2,
              backgroundColor: AVATAR_BG,
            },
            el("img", { width: AVATAR_SIZE, height: AVATAR_SIZE }, undefined, {
              src: `data:image/png;base64,${avatar.toString("base64")}`,
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
            }),
          ),
        ],
      ),
      el(
        "div",
        {
          display: "flex",
          marginTop: FOOTER_GAP,
          paddingTop: FOOTER_GAP,
          borderTop: `${FOOTER_RULE}px solid ${COLORS.border}`,
          fontSize: SMALL_TEXT,
          lineHeight: SMALL_LINE_HEIGHT,
          fontWeight: 700,
        },
        text.site,
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
 * @param {unknown} value
 * @param {string} where
 */
function nonEmptyString(value, where) {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${where}: expected a non-empty string`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} where
 * @returns {Record<string, unknown>}
 */
function asRecord(value, where) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${where}: expected a mapping`);
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * Reads the OGP text from site/index.md.
 * @returns {Promise<OgText>}
 */
async function readText() {
  const file = "site/index.md";
  const source = await readFile(`src/content/${file}`, "utf8");
  const match = source.match(FRONTMATTER);
  if (!match) throw new Error(`${file} has no frontmatter`);
  const data = asRecord(parse(match[1]), file);
  const person = asRecord(
    asRecord(data.seo, `${file} seo`).person,
    `${file} seo.person`,
  );
  const alternateName = nonEmptyString(
    person.alternateName,
    `${file} seo.person.alternateName`,
  );
  const jobTitle = nonEmptyString(
    person.jobTitle,
    `${file} seo.person.jobTitle`,
  );
  return {
    site: nonEmptyString(data.name, `${file} name`),
    name: nonEmptyString(person.name, `${file} seo.person.name`),
    role: personRole({ alternateName, jobTitle }),
  };
}

async function main() {
  process.chdir(fileURLToPath(new URL("..", import.meta.url)));
  const text = await readText();
  const source = await readFile(NOTO_SOURCE);
  verifySource(source);
  const avatar = await readFile(AVATAR_SOURCE);
  const png = await renderOgImage(text, source, avatar);
  await mkdir(dirname(OG_IMAGE.output), { recursive: true });
  await writeFile(OG_IMAGE.output, png);
  console.log(
    `OGP image: ${OG_IMAGE.output} (${(png.length / 1024).toFixed(1)} KiB)`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
