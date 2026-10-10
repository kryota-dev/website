// @ts-check
// Adds a Content-Security-Policy to dist/client/_headers. Inline scripts
// and styles are allowed by their sha256 hashes, collected from the built
// pages, so the policy never needs 'unsafe-inline'.
// Run after the final build; see scripts/build.mjs.
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Parser } from "htmlparser2";

const DIST_DIR = "dist/client";

/** Workers Static Assets rejects longer lines in _headers. */
export const MAX_HEADERS_LINE_LENGTH = 2000;

/**
 * JavaScript MIME type essences (MIME Sniffing Standard). A classic script
 * runs when its type essence is one of these.
 */
const JAVASCRIPT_MIME_TYPES = new Set([
  "application/ecmascript",
  "application/javascript",
  "application/x-ecmascript",
  "application/x-javascript",
  "text/ecmascript",
  "text/javascript",
  "text/javascript1.0",
  "text/javascript1.1",
  "text/javascript1.2",
  "text/javascript1.3",
  "text/javascript1.4",
  "text/javascript1.5",
  "text/jscript",
  "text/livescript",
  "text/x-ecmascript",
  "text/x-javascript",
]);

/** Non-classic script types that the browser also runs. */
const OTHER_EXECUTABLE_TYPES = new Set([
  "module",
  "importmap",
  "speculationrules",
]);

/**
 * Whether a script element runs, so that CSP applies to it. Follows the
 * type / language rules of "prepare the script element" (HTML Standard);
 * anything else (e.g. application/ld+json) is a data block.
 * @param {Record<string, string>} attributes
 */
export function isExecutableScript({ type, language }) {
  const typeString =
    type !== undefined
      ? type
      : language !== undefined && language !== ""
        ? `text/${language}`
        : "";
  const value = typeString.trim().toLowerCase();
  if (value === "") return true;
  if (OTHER_EXECUTABLE_TYPES.has(value)) return true;
  return JAVASCRIPT_MIME_TYPES.has(value.split(";")[0].trim());
}

/** @param {string} text */
function sha256(text) {
  return `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
}

/**
 * Hashes of the inline scripts that run and of the inline styles in a page.
 * @param {string} html
 * @returns {{ scripts: string[], styles: string[] }}
 */
export function inlineHashes(html) {
  /** @type {string[]} */
  const scripts = [];
  /** @type {string[]} */
  const styles = [];
  /** @type {{ list: string[], text: string } | undefined} */
  let current;

  const parser = new Parser({
    onopentag(name, attributes) {
      if (name === "style") {
        current = { list: styles, text: "" };
      } else if (name === "script") {
        current =
          isExecutableScript(attributes) && attributes.src === undefined
            ? { list: scripts, text: "" }
            : undefined;
      }
    },
    ontext(text) {
      if (current) current.text += text;
    },
    onclosetag(name) {
      if ((name === "script" || name === "style") && current) {
        current.list.push(sha256(current.text));
        current = undefined;
      }
    },
  });
  // Browsers normalize CRLF and CR to LF before parsing, and hash the result.
  parser.write(html.replace(/\r\n?/g, "\n"));
  parser.end();
  return { scripts, styles };
}

/** @param {string[]} hashes */
const sources = (hashes) =>
  ["'self'", ...[...new Set(hashes)].sort()].join(" ");

/**
 * @param {{ scripts: string[], styles: string[] }} hashes
 * @returns {string}
 */
export function buildCsp({ scripts, styles }) {
  return [
    "default-src 'self'",
    `script-src ${sources(scripts)}`,
    `style-src ${sources(styles)}`,
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** @param {string} dir */
async function listHtml(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** URL pattern of the rule that applies to every path. */
const CATCH_ALL = "/*";

/**
 * Adds a header line to the single catch-all rule of a _headers file.
 * Workers keeps only one rule per URL pattern, so a second "/*" block would
 * drop the headers of the first one.
 * @param {string} headers contents of _headers
 * @param {string} line indented "Name: value" line
 * @returns {string}
 */
export function addToCatchAll(headers, line) {
  const lines = headers.split("\n");
  const starts = lines.flatMap((text, index) =>
    text.trim() === CATCH_ALL && !/^\s/.test(text) ? [index] : [],
  );
  if (starts.length !== 1) {
    throw new Error(
      `_headers needs exactly one "${CATCH_ALL}" rule, found ${starts.length}`,
    );
  }
  let end = starts[0] + 1;
  while (end < lines.length && /^\s+\S/.test(lines[end])) end += 1;
  return [...lines.slice(0, end), line, ...lines.slice(end)].join("\n");
}

/**
 * Adds the policy for every page to the _headers file in `dir`.
 * @param {string} [dir]
 */
export async function writeCsp(dir = DIST_DIR) {
  const files = await listHtml(dir);
  if (files.length === 0) throw new Error(`No HTML found in ${dir}`);

  const all = {
    scripts: /** @type {string[]} */ ([]),
    styles: /** @type {string[]} */ ([]),
  };
  for (const file of files) {
    const { scripts, styles } = inlineHashes(await readFile(file, "utf8"));
    all.scripts.push(...scripts);
    all.styles.push(...styles);
  }

  const headersPath = join(dir, "_headers");
  const headers = await readFile(headersPath, "utf8");
  if (/^\s*content-security-policy\s*:/im.test(headers)) {
    throw new Error(
      `${headersPath} already sets Content-Security-Policy; it is generated by scripts/csp.mjs`,
    );
  }

  const line = `  Content-Security-Policy: ${buildCsp(all)}`;
  if (line.length > MAX_HEADERS_LINE_LENGTH) {
    throw new Error(
      `The CSP line is ${line.length} characters; _headers allows ${MAX_HEADERS_LINE_LENGTH}`,
    );
  }
  await writeFile(headersPath, addToCatchAll(headers, line));
  return line.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const length = await writeCsp();
  console.log(`CSP: ${DIST_DIR}/_headers (${length} characters)`);
}
