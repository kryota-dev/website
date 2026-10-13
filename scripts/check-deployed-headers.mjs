// @ts-check
// Checks that a deployed URL (a Preview or production) serves every header
// of the "/*" rule in dist/client/_headers with the same value, including
// the generated CSP. workers.dev hosts must carry noindex; other hosts must
// not. Right after a deploy the old version can still answer, so the check
// is retried until the headers match or the attempts run out (Issue #15).
// Usage: node scripts/check-deployed-headers.mjs <url>
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseHeaderRules } from "./headers-file.mjs";

const HEADERS_FILE = "dist/client/_headers";

/** Seen: the old version answered for about 0.5 s after a deploy (#14). */
const RETRY_INTERVAL_MS = 5_000;
/** One minute in all; longer means the deploy itself is wrong. */
const MAX_ATTEMPTS = 12;

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
 * Whether the host is kept out of search results (public/_headers).
 * @param {string} url
 */
export function expectsNoindex(url) {
  return new URL(url).hostname.endsWith(".workers.dev");
}

/**
 * Lists what the response gets wrong; an empty list means it passes.
 * @param {Headers} actual
 * @param {Map<string, string>} expected
 * @param {{ noindex: boolean }} options whether X-Robots-Tag: noindex is required or forbidden
 * @returns {string[]}
 */
export function headerProblems(actual, expected, { noindex }) {
  const problems = [];
  for (const name of REQUIRED_HEADERS) {
    if (!expected.has(name)) problems.push(`${name} is not in _headers`);
  }
  for (const [name, value] of expected) {
    const served = actual.get(name);
    if (served === null) problems.push(`missing ${name}`);
    else if (served !== value) problems.push(`${name} differs: ${served}`);
  }
  const indexed = !/\bnoindex\b/.test(actual.get("x-robots-tag") ?? "");
  if (noindex && indexed) problems.push("missing X-Robots-Tag: noindex");
  if (!noindex && !indexed) problems.push("unexpected X-Robots-Tag: noindex");
  return problems;
}

/**
 * Fetches the URL until it serves the expected headers or the attempts run
 * out, and returns the problems of the last response.
 * @param {string} url
 * @param {Map<string, string>} expected
 * @param {{
 *   noindex: boolean,
 *   attempts?: number,
 *   intervalMs?: number,
 *   fetch?: (url: string) => Promise<Response>,
 *   log?: (message: string) => void,
 * }} options
 * @returns {Promise<{ attempts: number, problems: string[] }>}
 */
export async function checkUntilServed(
  url,
  expected,
  {
    noindex,
    attempts = MAX_ATTEMPTS,
    intervalMs = RETRY_INTERVAL_MS,
    fetch = globalThis.fetch,
    log = console.log,
  },
) {
  /** @type {string[]} */
  let problems = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    problems = await fetch(url).then(
      (response) =>
        response.ok
          ? headerProblems(response.headers, expected, { noindex })
          : [`${url} returned ${response.status}`],
      // A host that is not reachable yet is retried like a stale one.
      (/** @type {unknown} */ error) => [`${url} failed: ${String(error)}`],
    );
    if (problems.length === 0) return { attempts: attempt, problems };
    if (attempt < attempts) {
      log(`Attempt ${attempt}/${attempts}: ${problems.join("; ")}`);
      await sleep(intervalMs);
    }
  }
  return { attempts, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.argv[2];
  if (!url) throw new Error("Usage: check-deployed-headers.mjs <url>");

  const expected = expectedHeaders(await readFile(HEADERS_FILE, "utf8"));
  const noindex = expectsNoindex(url);
  const { attempts, problems } = await checkUntilServed(url, expected, {
    noindex,
  });
  if (problems.length > 0) {
    console.error(
      `${url} after ${attempts} attempts:\n- ${problems.join("\n- ")}`,
    );
    process.exit(1);
  }
  const robots = noindex ? "noindex" : "no noindex";
  console.log(
    `${url}: ${expected.size} headers and ${robots} OK (attempt ${attempts})`,
  );
}
