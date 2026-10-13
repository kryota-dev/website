import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  checkUntilServed,
  expectedHeaders,
  expectsNoindex,
  headerProblems,
} from "../scripts/check-deployed-headers.mjs";
import {
  addToCatchAll,
  buildCsp,
  inlineHashes,
  writeCsp,
} from "../scripts/csp.mjs";
import { headerValues, readCsp, readHeaderRules } from "./headers";

/** Fixed by Issue #2 and the deploy requirements, not read from the code. */
const EXPECTED_VALUES = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy":
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "cross-origin-opener-policy": "same-origin",
};
/** The beacon Cloudflare's automatic setup injects, with and without a version. */
const WEB_ANALYTICS_SOURCES =
  "https://static.cloudflareinsights.com/beacon.min.js https://static.cloudflareinsights.com/beacon.min.js/";
/** One year, the usual HSTS minimum. */
const MIN_HSTS_MAX_AGE = 31_536_000;
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
const hash = (text: string) =>
  `'sha256-${createHash("sha256").update(text).digest("base64")}'`;

test.describe("配信する _headers", () => {
  test("URL パターンごとに規則は 1 つだけ（Workers は同じパターンの規則を 1 つしか使わない）", () => {
    const patterns = rules.map((rule) => rule.pattern);
    expect(patterns).toEqual([...new Set(patterns)]);
  });

  test("全パスにセキュリティヘッダーを決めた値で 1 つずつ返す", () => {
    for (const [name, value] of Object.entries(EXPECTED_VALUES)) {
      expect(headerValues(rules, "/*", name), name).toEqual([value]);
    }
    const hsts = headerValues(rules, "/*", "strict-transport-security");
    expect(hsts).toHaveLength(1);
    const maxAge = Number(/^max-age=(\d+)$/.exec(hsts[0])?.[1]);
    expect(maxAge).toBeGreaterThanOrEqual(MIN_HSTS_MAX_AGE);
  });

  test("CSP は必須のディレクティブを持ち、unsafe-inline と unsafe-eval を使わない", () => {
    const csp = readCsp(rules);
    const directives = csp.split(";").map((directive) => directive.trim());
    for (const directive of REQUIRED_DIRECTIVES) {
      expect(directives).toContain(directive);
    }
    expect(csp).not.toMatch(/unsafe-(inline|eval)/);
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
    const lines = readFileSync("dist/client/_headers", "utf8").split("\n");
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(MAX_LINE_LENGTH);
    }
  });
});

test.describe("インライン要素の hash", () => {
  test("実行される script だけを hash にし、データブロックと外部の script は除く", () => {
    const runs = [
      "<script>a()</script>",
      '<script type="">b()</script>',
      '<script type="module">c()</script>',
      '<script type="text/javascript; charset=utf-8">d()</script>',
      '<script type="application/x-javascript">e()</script>',
      '<script language="javascript">f()</script>',
    ];
    const skipped = [
      '<script type="application/ld+json">{"g":1}</script>',
      '<script type="text/plain">h()</script>',
      '<script language="vbscript">i()</script>',
      '<script src="/j.js">j()</script>',
    ];
    const { scripts, styles } = inlineHashes([...runs, ...skipped].join(""));
    expect(scripts).toEqual(
      ["a()", "b()", "c()", "d()", "e()", "f()"].map(hash),
    );
    expect(styles).toEqual([]);
  });

  test("style の中身を hash にする", () => {
    expect(inlineHashes("<style>a{color:red}</style>").styles).toEqual([
      hash("a{color:red}"),
    ]);
  });

  test("ブラウザと同じく CRLF と CR を LF にしてから hash にする", () => {
    const { scripts, styles } = inlineHashes(
      "<script>a()\r\nb()\rc()</script><style>\r\na{}</style>",
    );
    expect(scripts).toEqual([hash("a()\nb()\nc()")]);
    expect(styles).toEqual([hash("\na{}")]);
  });

  test("CSP の hash は重複を除いて整列し、script と style を分ける", () => {
    const csp = buildCsp({
      scripts: [hash("b"), hash("a"), hash("b")],
      styles: [hash("c")],
    });
    expect(csp).toContain(
      `script-src 'self' ${[hash("a"), hash("b")].sort().join(" ")} ${WEB_ANALYTICS_SOURCES};`,
    );
    expect(csp).toContain(`style-src 'self' ${hash("c")};`);
  });

  test("Web Analytics の beacon は script-src でそのパスだけを許可し、送信先は 'self' のまま", () => {
    const csp = buildCsp({ scripts: [], styles: [] });
    expect(csp).toContain(`script-src 'self' ${WEB_ANALYTICS_SOURCES};`);
    expect(csp).toContain("connect-src 'self';");
  });
});

test.describe("CSP の書き込み", () => {
  const BASE_HEADERS = "/*\n  A: 1\n\n/x\n  B: 2\n";

  /** A dist directory with the given pages and _headers. */
  function fixture(pages: string[], headers: string | null = BASE_HEADERS) {
    const dir = mkdtempSync(join(tmpdir(), "csp-"));
    pages.forEach((html, index) => {
      mkdirSync(join(dir, `p${index}`));
      writeFileSync(join(dir, `p${index}`, "index.html"), html);
    });
    if (headers !== null) writeFileSync(join(dir, "_headers"), headers);
    return dir;
  }
  const headersIn = (dir: string) =>
    readFileSync(join(dir, "_headers"), "utf8");

  test("既存の /* の規則の中に足し、別の規則を作らない", async () => {
    expect(addToCatchAll(BASE_HEADERS, "  C: 3")).toBe(
      "/*\n  A: 1\n  C: 3\n\n/x\n  B: 2\n",
    );
    const dir = fixture(["<script>a()</script>"]);
    await writeCsp(dir);
    const written = headersIn(dir).split("\n");
    expect(written.slice(0, 2)).toEqual(["/*", "  A: 1"]);
    expect(written[2]).toMatch(/^ {2}Content-Security-Policy: /);
    expect(written[2]).toContain(hash("a()"));
  });

  test("上限に収まる数の hash なら書き込み、1 つでも超えたら失敗して _headers を変えない", async () => {
    // Each distinct style adds one hash; find how many fit in one line.
    const bodies = Array.from({ length: 40 }, (_, i) => `.s${i}{}`);
    const lineLength = (count: number) =>
      `  Content-Security-Policy: ${buildCsp({
        scripts: [],
        styles: bodies.slice(0, count).map(hash),
      })}`.length;
    const fits = bodies.findIndex(
      (_, i) => lineLength(i + 1) > MAX_LINE_LENGTH,
    );
    expect(fits).toBeGreaterThan(0);
    const page = (count: number) =>
      bodies
        .slice(0, count)
        .map((body) => `<style>${body}</style>`)
        .join("");

    const over = fixture([page(fits + 1)]);
    await expect(writeCsp(over)).rejects.toThrow(/2000/);
    expect(headersIn(over)).toBe(BASE_HEADERS);

    const under = fixture([page(fits)]);
    expect(await writeCsp(under)).toBe(lineLength(fits));
  });

  test("CSP がすでにある・/* の規則が 1 つでない・HTML がない・_headers がないときは失敗する", async () => {
    const page = ["<p>a</p>"];
    const withCsp = "/*\n  Content-Security-Policy: default-src 'self'\n";
    await expect(writeCsp(fixture(page, withCsp))).rejects.toThrow(
      /already sets/,
    );
    await expect(writeCsp(fixture(page, "/x\n  B: 2\n"))).rejects.toThrow(
      /exactly one/,
    );
    await expect(
      writeCsp(fixture(page, "/*\n  A: 1\n/*\n  B: 2\n")),
    ).rejects.toThrow(/exactly one/);
    await expect(writeCsp(fixture([]))).rejects.toThrow(/No HTML/);
    await expect(writeCsp(fixture(page, null))).rejects.toThrow(/ENOENT/);
  });
});

test.describe("デプロイ先のヘッダーの確認", () => {
  const expected = expectedHeaders(
    readFileSync("dist/client/_headers", "utf8"),
  );
  const served = () => new Headers([...expected, ["x-robots-tag", "noindex"]]);
  const indexable = () => new Headers([...expected]);

  test("_headers のとおりに返れば問題なし", () => {
    expect(headerProblems(served(), expected, { noindex: true })).toEqual([]);
    expect(headerProblems(indexable(), expected, { noindex: false })).toEqual(
      [],
    );
  });

  test("欠けたヘッダー・違う値・noindex の欠落を検出する", () => {
    const missing = served();
    missing.delete("strict-transport-security");
    expect(headerProblems(missing, expected, { noindex: true })).toEqual([
      "missing strict-transport-security",
    ]);

    const weakened = served();
    weakened.set("content-security-policy", "default-src *");
    expect(headerProblems(weakened, expected, { noindex: true })).toEqual([
      "content-security-policy differs: default-src *",
    ]);

    expect(headerProblems(indexable(), expected, { noindex: true })).toEqual([
      "missing X-Robots-Tag: noindex",
    ]);
  });

  test("検索の対象にするホストで noindex が付いていれば検出する", () => {
    expect(headerProblems(served(), expected, { noindex: false })).toEqual([
      "unexpected X-Robots-Tag: noindex",
    ]);
  });

  test("_headers に必須のヘッダーが無ければ検出する", () => {
    const partial = new Map(expected);
    partial.delete("referrer-policy");
    expect(headerProblems(served(), partial, { noindex: true })).toContain(
      "referrer-policy is not in _headers",
    );
  });

  test("noindex を期待するのは workers.dev のホストだけ", () => {
    expect(
      expectsNoindex("https://pr-1-kryota-dev-website.example.workers.dev/"),
    ).toBe(true);
    expect(expectsNoindex("https://kryota.dev/")).toBe(false);
    expect(expectsNoindex("https://workers.dev.example.com/")).toBe(false);
  });

  test.describe("配信の反映を待つ", () => {
    const URL = "https://kryota.dev/";

    /** Answers each fetch with the next response, then repeats the last. */
    function responses(...list: Response[]) {
      let calls = 0;
      const fetch = async () => list[Math.min(calls++, list.length - 1)];
      return { fetch, calls: () => calls };
    }
    const options = (fetch: () => Promise<Response>, attempts = 3) => ({
      noindex: false,
      attempts,
      intervalMs: 0,
      fetch,
      log: () => {},
    });
    const stale = () =>
      new Response(null, {
        headers: [...expected].map(([name, value]) =>
          name === "content-security-policy"
            ? [name, "default-src 'self'"]
            : [name, value],
        ),
      });

    test("反映されれば、その時点で通る", async () => {
      const fake = responses(
        stale(),
        new Response(null, { status: 404 }),
        new Response(null, { headers: [...expected] }),
      );
      const result = await checkUntilServed(URL, expected, options(fake.fetch));
      expect(result).toEqual({ attempts: 3, problems: [] });
      expect(fake.calls()).toBe(3);
    });

    test("上限まで食い違えば、最後の食い違いを返して止まる", async () => {
      const fake = responses(stale());
      const result = await checkUntilServed(
        URL,
        expected,
        options(fake.fetch, 4),
      );
      expect(result.attempts).toBe(4);
      expect(result.problems).toEqual([
        "content-security-policy differs: default-src 'self'",
      ]);
      expect(fake.calls()).toBe(4);
    });

    test("接続に失敗しても止まらず、次の試行で通れば通る", async () => {
      let calls = 0;
      const fetch = async () => {
        calls++;
        if (calls === 1) throw new TypeError("fetch failed");
        return new Response(null, { headers: [...expected] });
      };
      const result = await checkUntilServed(URL, expected, options(fetch));
      expect(result).toEqual({ attempts: 2, problems: [] });
    });

    test("成功でない応答は、その状態を食い違いとして扱う", async () => {
      const fake = responses(new Response(null, { status: 503 }));
      const result = await checkUntilServed(
        URL,
        expected,
        options(fake.fetch, 1),
      );
      expect(result.problems).toEqual([`${URL} returned 503`]);
    });
  });
});
