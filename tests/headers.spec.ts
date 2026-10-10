import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { addToCatchAll, buildCsp, inlineHashes } from "../scripts/csp.mjs";
import { headerValues, readCsp, readHeaderRules } from "./headers";

/** Fixed by Issue #2 and the deploy requirements, not read from the code. */
const SECURITY_HEADERS = [
  "strict-transport-security",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
  "content-security-policy",
];
const REQUIRED_DIRECTIVES = [
  "default-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];
const WORKERS_DEV_HOSTS = "https://:worker.:subdomain.workers.dev/*";
/** Workers Static Assets limit for one line of _headers. */
const MAX_LINE_LENGTH = 2000;

const rules = readHeaderRules();

test("URL パターンごとに規則は 1 つだけ（Workers は同じパターンの規則を 1 つしか使わない）", () => {
  const patterns = rules.map((rule) => rule.pattern);
  expect(patterns).toEqual([...new Set(patterns)]);
});

test("CSP は既存の /* の規則の中に足し、別の規則を作らない", () => {
  const headers = ["/*", "  A: 1", "", "/x", "  B: 2", ""].join("\n");
  expect(addToCatchAll(headers, "  C: 3")).toBe(
    ["/*", "  A: 1", "  C: 3", "", "/x", "  B: 2", ""].join("\n"),
  );
  expect(() => addToCatchAll("/x\n  B: 2\n", "  C: 3")).toThrow();
});

test("全パスにセキュリティヘッダーを 1 つずつ返す", () => {
  for (const name of SECURITY_HEADERS) {
    expect(headerValues(rules, "/*", name), name).toHaveLength(1);
  }
  expect(headerValues(rules, "/*", "x-content-type-options")).toEqual([
    "nosniff",
  ]);
  expect(headerValues(rules, "/*", "strict-transport-security")[0]).toMatch(
    /^max-age=\d{8,}/,
  );
});

test("CSP は必須のディレクティブを持ち、unsafe-inline と unsafe-eval を使わない", () => {
  const directives = readCsp(rules)
    .split(";")
    .map((directive) => directive.trim());
  for (const directive of REQUIRED_DIRECTIVES) {
    expect(directives).toContain(directive);
  }
  expect(readCsp(rules)).not.toMatch(/unsafe-(inline|eval)/);
});

test("noindex は workers.dev のホストにだけ付き、独自ドメインには付かない", () => {
  expect(headerValues(rules, WORKERS_DEV_HOSTS, "x-robots-tag")).toEqual([
    "noindex",
  ]);
  const elsewhere = rules
    .filter((rule) => rule.pattern !== WORKERS_DEV_HOSTS)
    .flatMap((rule) => rule.headers)
    .filter(([name]) => name === "x-robots-tag");
  expect(elsewhere).toEqual([]);
});

test("アダプターが足す /_astro/* の Cache-Control が残る", () => {
  expect(headerValues(rules, "/_astro/*", "cache-control")).toEqual([
    "public, max-age=31536000, immutable",
  ]);
});

test("_headers の各行が上限の文字数に収まる", () => {
  for (const line of readFileSync("dist/client/_headers", "utf8").split("\n")) {
    expect(line.length).toBeLessThanOrEqual(MAX_LINE_LENGTH);
  }
});

test("実行される script と style だけを hash にし、JSON-LD などのデータは除く", () => {
  const html = [
    "<script>run()</script>",
    '<script type="module">run()</script>',
    '<script type="application/ld+json">{"a":1}</script>',
    '<script src="/a.js"></script>',
    "<style>a{color:red}</style>",
  ].join("");
  const { scripts, styles } = inlineHashes(html);
  expect(scripts).toHaveLength(2);
  expect(styles).toHaveLength(1);
  expect(buildCsp({ scripts, styles })).toContain(scripts[0]);
});
