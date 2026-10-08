// @ts-check
// Subsets Noto Sans JP to the characters used by the built pages.
// Run after a build of dist/client; see scripts/build.mjs.
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeHTML } from "entities";
import subsetFont from "subset-font";
import {
  NOTO_SOURCE,
  NOTO_SOURCE_SHA256,
  NOTO_SUBSET,
  NOTO_SUBSET_CHARS,
} from "./font-paths.mjs";

const DIST_DIR = "dist/client";

/** Printable ASCII is always kept so that small edits never miss a glyph. */
const ASCII_PRINTABLE = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) =>
  String.fromCodePoint(0x20 + i),
).join("");

/**
 * name IDs kept in the subset: harfbuzz keeps 0–6 by default; 13 and 14 carry
 * the license (description and URL) that the OFL requires to travel with the font.
 */
const PRESERVED_NAME_IDS = [0, 1, 2, 3, 4, 5, 6, 13, 14];

/** @param {string} dir */
async function listHtml(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => join(entry.parentPath, entry.name));
}

/**
 * Collects every character in the built HTML, markup included. A superset is
 * fine (a few extra glyphs); a missing character would fall back to a system font.
 * Character references are decoded with the HTML rules (entities.decodeHTML).
 * @param {string} [dir]
 * @returns {Promise<string>}
 */
export async function collectCharacters(dir = DIST_DIR) {
  const files = await listHtml(dir);
  if (files.length === 0) {
    throw new Error(`No HTML found in ${dir}; run the collect build first.`);
  }
  const chars = new Set(ASCII_PRINTABLE);
  for (const file of files) {
    for (const char of decodeHTML(await readFile(file, "utf8"))) {
      if (char >= " ") chars.add(char);
    }
  }
  return [...chars].sort().join("");
}

/** @param {Buffer} source */
function verifySource(source) {
  const actual = createHash("sha256").update(source).digest("hex");
  if (actual !== NOTO_SOURCE_SHA256) {
    throw new Error(
      `${NOTO_SOURCE} sha256 is ${actual}, expected ${NOTO_SOURCE_SHA256} (see fonts/noto-sans-jp/SOURCE.md)`,
    );
  }
}

async function main() {
  process.chdir(fileURLToPath(new URL("..", import.meta.url)));
  const text = await collectCharacters();
  const source = await readFile(NOTO_SOURCE);
  verifySource(source);
  // Variation axes are kept unless `variationAxes` is given (wght stays 100–900).
  const subset = await subsetFont(source, text, {
    targetFormat: "woff2",
    preserveNameIds: PRESERVED_NAME_IDS,
  });
  await mkdir(dirname(NOTO_SUBSET), { recursive: true });
  await writeFile(NOTO_SUBSET, subset);
  await writeFile(NOTO_SUBSET_CHARS, text);
  console.log(
    `Subset ${NOTO_SOURCE}: ${[...text].length} characters, ${(subset.length / 1024).toFixed(1)} KiB`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
