// @ts-check
// Checks that a deployed URL (a workers.dev Preview) serves the security
// headers from public/_headers and the CSP generated into dist/client/_headers.
// Usage: node scripts/check-deployed-headers.mjs <url>
import { readFile } from "node:fs/promises";

const HEADERS_FILE = "dist/client/_headers";

/** Headers every page must carry (Issue #2). */
const REQUIRED_HEADERS = [
  "strict-transport-security",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
  "content-security-policy",
];

const url = process.argv[2];
if (!url) throw new Error("Usage: check-deployed-headers.mjs <url>");

const generated = (await readFile(HEADERS_FILE, "utf8"))
  .split("\n")
  .map((line) => line.match(/^\s+Content-Security-Policy:\s*(.+)$/i)?.[1])
  .find((value) => value !== undefined);
if (!generated)
  throw new Error(`No Content-Security-Policy in ${HEADERS_FILE}`);

const response = await fetch(url);
if (!response.ok) throw new Error(`${url} returned ${response.status}`);

const problems = [];
for (const name of REQUIRED_HEADERS) {
  if (!response.headers.has(name)) problems.push(`missing ${name}`);
}
if (response.headers.get("content-security-policy") !== generated.trim()) {
  problems.push("content-security-policy differs from the build");
}
// workers.dev hosts must stay out of search results (public/_headers).
if (!/\bnoindex\b/.test(response.headers.get("x-robots-tag") ?? "")) {
  problems.push("missing X-Robots-Tag: noindex");
}

if (problems.length > 0) {
  console.error(`${url}:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`${url}: security headers OK`);
