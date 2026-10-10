// @ts-check
// Checks that a deployed URL (a workers.dev Preview) serves every header of
// the "/*" rule in dist/client/_headers with the same value, including the
// generated CSP, plus the workers.dev noindex.
// Usage: node scripts/check-deployed-headers.mjs <url>
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseHeaderRules } from "./headers-file.mjs";

const HEADERS_FILE = "dist/client/_headers";

/** Headers every page must carry (Issue #2). */
export const REQUIRED_HEADERS = [
  "strict-transport-security",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
  "content-security-policy",
];

/**
 * The headers of the catch-all rule, as name → value.
 * @param {string} text contents of _headers
 * @returns {Map<string, string>}
 */
export function expectedHeaders(text) {
  const rules = parseHeaderRules(text).filter((rule) => rule.pattern === "/*");
  if (rules.length !== 1) {
    throw new Error(`Expected one "/*" rule, found ${rules.length}`);
  }
  return new Map(rules[0].headers);
}

/**
 * Lists what the response gets wrong; an empty list means it passes.
 * @param {Headers} actual
 * @param {Map<string, string>} expected
 * @returns {string[]}
 */
export function headerProblems(actual, expected) {
  const problems = [];
  for (const name of REQUIRED_HEADERS) {
    if (!expected.has(name)) problems.push(`${name} is not in _headers`);
  }
  for (const [name, value] of expected) {
    const served = actual.get(name);
    if (served === null) problems.push(`missing ${name}`);
    else if (served !== value) problems.push(`${name} differs: ${served}`);
  }
  // workers.dev hosts must stay out of search results (public/_headers).
  if (!/\bnoindex\b/.test(actual.get("x-robots-tag") ?? "")) {
    problems.push("missing X-Robots-Tag: noindex");
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.argv[2];
  if (!url) throw new Error("Usage: check-deployed-headers.mjs <url>");

  const expected = expectedHeaders(await readFile(HEADERS_FILE, "utf8"));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);

  const problems = headerProblems(response.headers, expected);
  if (problems.length > 0) {
    console.error(`${url}:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${url}: ${expected.size} headers and noindex OK`);
}
