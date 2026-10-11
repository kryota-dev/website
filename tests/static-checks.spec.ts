import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";

/** The options of `pnpm test:html`, applied here to fixtures as well. */
const HTML_VALIDATE_OPTIONS = "--config .htmlvalidate.mjs --max-warnings 0";

const page = (body: string) =>
  `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>`;

/** A site directory with the given files (path → body). */
function site(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "static-checks-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}

const checkLinks = (dir: string) =>
  run(process.execPath, ["scripts/check-links.mjs", dir]);
const validateHtml = (dir: string) =>
  run("node_modules/.bin/html-validate", [
    ...HTML_VALIDATE_OPTIONS.split(" "),
    dir,
  ]);

test.describe("リンク切れの検査", () => {
  const target = page('<h2 id="sec">s</h2>');

  test("ディレクトリ・アンカー・外部リンクが正しければ通る", () => {
    const dir = site({
      "index.html": page(
        '<h1 id="top">x</h1><a href="/a/">a</a><a href="/a/#sec">sec</a><a href="#top">top</a><a href="https://example.com/">ext</a>',
      ),
      "a/index.html": target,
    });
    expect(checkLinks(dir).status).toBe(0);
  });

  for (const [name, href, reported] of [
    ["存在しないページ", "/missing/", "/missing"],
    ["別のページの存在しないアンカー", "/a/#nope", "#nope"],
    ["同じページの存在しないアンカー", "#nope", "#nope"],
  ]) {
    test(`${name}へのリンクがあると失敗する`, () => {
      const dir = site({
        "index.html": page(`<a href="${href}">x</a>`),
        "a/index.html": target,
      });
      const { status, output } = checkLinks(dir);
      expect(status).not.toBe(0);
      expect(output).toContain(reported);
    });
  }

  test("index.html のないディレクトリへのリンクは失敗する", () => {
    const dir = site({
      "index.html": page('<a href="/a/">a</a>'),
      "a/other.html": target,
    });
    expect(checkLinks(dir).status).not.toBe(0);
  });

  test("HTML がなければ失敗する", () => {
    const { status, output } = checkLinks(site({}));
    expect(status).not.toBe(0);
    expect(output).toContain("No HTML files");
  });

  test("ビルドしたページは通る", () => {
    expect(checkLinks("dist/client").status).toBe(0);
  });
});

test.describe("HTML の妥当性の検証", () => {
  test("pnpm test:html と同じ設定で検証する", () => {
    const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));
    expect(scripts["test:html"]).toBe(
      `html-validate ${HTML_VALIDATE_OPTIONS} dist/client`,
    );
  });

  test('正しい HTML と role="list" の ul は通る', () => {
    const dir = site({
      "index.html": page('<ul role="list"><li>a</li></ul>'),
    });
    expect(validateHtml(dir).status).toBe(0);
  });

  test("不正な HTML があると失敗する", () => {
    const dir = site({ "index.html": page("<p><div>x</div></p>") });
    const { status, output } = validateHtml(dir);
    expect(status).not.toBe(0);
    expect(output).toContain("no-implicit-close");
  });

  test("ビルドしたページは通る", () => {
    expect(validateHtml("dist/client").status).toBe(0);
  });
});
