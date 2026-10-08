// Subsets Noto Sans JP to the characters used by the built pages.
// Run after a build of dist/client; see scripts/build.mjs.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import subsetFont from "subset-font";
import { NOTO_SOURCE, NOTO_SUBSET, NOTO_SUBSET_CHARS } from "./font-paths.mjs";

const DIST_DIR = "dist/client";

/** Printable ASCII is always kept so that small edits never miss a glyph. */
const ASCII_PRINTABLE = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) =>
  String.fromCodePoint(0x20 + i),
).join("");

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(html) {
  return html.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      return String.fromCodePoint(
        Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10),
      );
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

async function listHtml(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => join(entry.parentPath, entry.name));
}

/**
 * Collects every character in the built HTML, markup included. A superset is
 * fine (a few extra glyphs); a missing character would fall back to a system font.
 */
export async function collectCharacters(dir = DIST_DIR) {
  const files = await listHtml(dir);
  if (files.length === 0) {
    throw new Error(`No HTML found in ${dir}; run the collect build first.`);
  }
  const chars = new Set(ASCII_PRINTABLE);
  for (const file of files) {
    for (const char of decodeEntities(await readFile(file, "utf8"))) {
      if (char >= " ") chars.add(char);
    }
  }
  return [...chars].sort().join("");
}

async function main() {
  const text = await collectCharacters();
  const source = await readFile(NOTO_SOURCE);
  // Variation axes are kept unless `variationAxes` is given (wght stays 100–900).
  const subset = await subsetFont(source, text, { targetFormat: "woff2" });
  await mkdir(dirname(NOTO_SUBSET), { recursive: true });
  await writeFile(NOTO_SUBSET, subset);
  await writeFile(NOTO_SUBSET_CHARS, text);
  console.log(
    `Subset ${NOTO_SOURCE}: ${[...text].length} characters, ${(subset.length / 1024).toFixed(1)} KiB`,
  );
}

await main();
