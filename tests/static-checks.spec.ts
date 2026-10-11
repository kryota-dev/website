import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";

/** The options of `pnpm test:html`, applied here to fixtures as well. */
const HTML_VALIDATE_OPTIONS = "--config .htmlvalidate.mjs --max-warnings 0";
/** A hung child process fails the test instead of blocking the worker. */
const CHILD_TIMEOUT_MS = 60_000;
/** Refuses connections at once, so a network request would be reported. */
const UNREACHABLE_EXTERNAL = "http://127.0.0.1:9/";

const page = (body: string) =>
  `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>`;

const created: string[] = [];
test.afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A site directory with the given files (path → body). */
function site(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "static-checks-"));
  created.push(dir);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

function run(command: string, args: string[], env = process.env) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env,
    timeout: CHILD_TIMEOUT_MS,
  });
  if (result.error) throw result.error;
  // A crash or a timeout must not pass as an expected failure.
  if (result.status === null) {
    throw new Error(`${command} was killed by ${result.signal}`);
  }
  return { status: result.status, output: result.stdout + result.stderr };
}

const checkLinks = (dir: string, env?: NodeJS.ProcessEnv) =>
  run(process.execPath, ["scripts/check-links.mjs", dir], env);
const validateHtml = (dir: string, ...extra: string[]) =>
  run("node_modules/.bin/html-validate", [
    ...HTML_VALIDATE_OPTIONS.split(" "),
    ...extra,
    dir,
  ]);

const passes = ({ status, output }: { status: number; output: string }) =>
  expect(status, output).toBe(0);

test.describe("リンク切れの検査", () => {
  const target = page('<h2 id="sec">s</h2><a href="../">up</a>');

  test("ディレクトリ・ファイル・アンカー・自サイトの URL・外部リンクが正しければ通る", () => {
    const dir = site({
      "index.html": page(
        `<h1 id="top">x</h1><a href="/a/">a</a><a href="/a/#sec">sec</a><a href="#top">top</a><a href="/icon.svg">icon</a><a href="https://kryota.dev/a/#sec">abs</a><a href="${UNREACHABLE_EXTERNAL}">ext</a>`,
      ),
      "a/index.html": target,
      "icon.svg": "<svg xmlns='http://www.w3.org/2000/svg'/>",
    });
    passes(checkLinks(dir));
  });

  for (const [name, href, reported] of [
    ["存在しないページ", "/missing/", "/missing"],
    ["存在しないファイル", "/missing.svg", "/missing.svg"],
    ["別のページの存在しないアンカー", "/a/#nope", "#nope"],
    ["同じページの存在しないアンカー", "#nope", "#nope"],
    [
      "自サイトの URL の存在しないページ",
      "https://kryota.dev/missing/",
      "/missing",
    ],
    [
      "自サイトの URL の存在しないアンカー",
      "https://kryota.dev/a/#nope",
      "#nope",
    ],
    ["下層からの相対リンクの存在しないページ", "../nope/", "/nope"],
  ]) {
    test(`下層のページに${name}へのリンクがあると失敗する`, () => {
      // Only a nested page is broken, so every page must be scanned.
      const dir = site({
        "index.html": page('<a href="/a/">a</a>'),
        "a/index.html": target,
        "a/b/index.html": page(`<a href="${href}">x</a>`),
      });
      const { status, output } = checkLinks(dir);
      expect(status, output).toBe(2);
      expect(output).toContain(reported);
      expect(output).toContain("a/b/index.html");
    });
  }

  test("index.html のないディレクトリへのリンクは失敗する", () => {
    const dir = site({
      "index.html": page('<a href="/a/">a</a>'),
      "a/other.html": page("x"),
    });
    const { status, output } = checkLinks(dir);
    expect(status, output).toBe(2);
    expect(output).toContain("/a");
  });

  test("自サイトの origin は astro.config.mjs の site と同じ", () => {
    const site = /\bsite: "([^"]+)"/.exec(
      readFileSync("astro.config.mjs", "utf8"),
    )?.[1];
    expect(site).toBeDefined();
    expect(readFileSync("scripts/check-links.mjs", "utf8")).toContain(
      `const SITE_ORIGIN = "${site}";`,
    );
  });

  test("HTML のファイルがなければ失敗する", () => {
    for (const dir of [
      site({}),
      site({ "x.html/.keep": "" }),
      join(tmpdir(), "static-checks-missing"),
    ]) {
      const { status, output } = checkLinks(dir);
      expect(status, output).not.toBe(0);
      expect(output).toContain("No HTML files");
    }
  });

  test("lychee がなければ入れ方を示して失敗する", () => {
    const dir = site({ "index.html": page("x") });
    const { status, output } = checkLinks(dir, {
      PATH: dirname(process.execPath),
    });
    expect(status, output).not.toBe(0);
    expect(output).toContain("lychee is not installed");
  });

  test("ビルドしたページは通る", () => {
    passes(checkLinks("dist/client"));
  });
});

test.describe("HTML の妥当性の検証", () => {
  test("pnpm test:html と同じ設定で検証する", () => {
    const { scripts }: { scripts: Record<string, string> } = JSON.parse(
      readFileSync("package.json", "utf8"),
    );
    expect(scripts["test:html"]).toBe(
      `html-validate ${HTML_VALIDATE_OPTIONS} dist/client`,
    );
  });

  test('role="list" の ul は通る', () => {
    const dir = site({
      "index.html": page('<ul role="list"><li>a</li></ul>'),
    });
    passes(validateHtml(dir));
  });

  test("list 以外の冗長な role は失敗する", () => {
    const dir = site({
      "index.html": page('<button type="button" role="button">x</button>'),
    });
    const { status, output } = validateHtml(dir);
    expect(status, output).toBe(1);
    expect(output).toContain("no-redundant-role");
  });

  test("下層のページの不正な HTML で失敗する", () => {
    const dir = site({
      "index.html": page("x"),
      "a/b/index.html": page("<p><div>x</div></p>"),
    });
    const { status, output } = validateHtml(dir);
    expect(status, output).toBe(1);
    expect(output).toContain("no-implicit-close");
  });

  test("警告だけでも失敗する", () => {
    // Only the rule that this fixture breaks is lowered to a warning.
    const dir = site({ "index.html": page("<button>x</button>") });
    const { status, output } = validateHtml(
      dir,
      "--rule",
      "no-implicit-button-type:warn",
    );
    expect(output).toContain("(0 errors, 1 warning)");
    expect(status, output).toBe(1);
  });

  test("ビルドしたページは通る", () => {
    passes(validateHtml("dist/client"));
  });
});
