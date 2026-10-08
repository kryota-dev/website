import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { create, type Font } from "fontkit";
import { listBuiltPages } from "./pages";

const DIST_DIR = "dist/client";
const NOTO_FAMILY = "Noto Sans JP";
const FONT_FACE = /@font-face\s*\{[^}]*\}/g;

const pageFile = (path: string) =>
  join(DIST_DIR, path.endsWith("/") ? `${path}index.html` : `${path}.html`);

/** The woff2 URL that the built CSS declares for a font family. */
function fontUrl(html: string, family: string): string {
  const face = (html.match(FONT_FACE) ?? []).find((rule) =>
    rule.includes(`font-family:"${family}-`),
  );
  const url = face?.match(/src:url\("([^"]+)"\)/)?.[1];
  if (!url) throw new Error(`No @font-face with a URL for ${family}`);
  return url;
}

function loadServedFont(url: string): Font {
  const font = create(readFileSync(join(DIST_DIR, url)));
  if (!("characterSet" in font)) throw new Error(`${url} is a collection`);
  return font;
}

const pages = listBuiltPages();
const indexHtml = readFileSync(pageFile("/"), "utf8");
const notoUrl = fontUrl(indexHtml, NOTO_FAMILY);
const noto = loadServedFont(notoUrl);

test.describe("出力 HTML", () => {
  for (const path of pages) {
    test(`${path} はフォントを自サイトからだけ読み込み、和文フォントを preload する`, () => {
      const html = readFileSync(pageFile(path), "utf8");
      const sources = (html.match(FONT_FACE) ?? []).flatMap((rule) =>
        [...rule.matchAll(/url\("([^"]+)"\)/g)].map((match) => match[1]),
      );
      expect(sources.length).toBeGreaterThan(0);
      for (const source of sources) {
        expect(source).toMatch(/^\/_astro\/fonts\/[^/]+\.woff2$/);
      }
      expect(html).not.toMatch(
        /fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/,
      );
      expect(html).toContain(
        `<link rel="preload" href="${notoUrl}" as="font" type="font/woff2" crossorigin>`,
      );
    });
  }
});

test("配信する和文フォントは wght 軸（100〜900）を保つ", () => {
  expect(noto.variationAxes.wght).toMatchObject({ min: 100, max: 900 });
});

test.describe("表示される文字", () => {
  for (const path of pages) {
    test(`${path} の文字はすべて和文フォントのサブセットに含まれる`, async ({
      page,
    }) => {
      await page.goto(path);
      const text = await page.evaluate(() => document.body.innerText);
      const missing = [...new Set(text)].filter(
        (char) =>
          char.trim() !== "" &&
          !noto.hasGlyphForCodePoint(char.codePointAt(0)!),
      );
      expect(missing).toEqual([]);
    });
  }
});

async function headingWidthAt(page: Page, weight: number) {
  return page.locator("#hero-heading").evaluate(async (el, value) => {
    el.style.transition = "none";
    el.style.setProperty("--hero-wght", String(value));
    await document.fonts.ready;
    // Measure the text itself: the block box spans the container regardless.
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().width;
  }, weight);
}

test("Hero の見出しは和文フォントで描画され、wght の変化が太さに連続的に反映される", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(
    (family) =>
      [...document.fonts].some(
        (face) =>
          face.family.replace(/"/g, "").startsWith(`${family}-`) &&
          face.status === "loaded",
      ),
    NOTO_FAMILY,
  );
  expect(loaded).toBe(true);

  // A variable font changes width at every step; a system font with a few
  // fixed weights would render some of these steps identically.
  const widths = [];
  for (const weight of [300, 400, 500]) {
    widths.push(await headingWidthAt(page, weight));
  }
  expect(widths[1]).toBeGreaterThan(widths[0]);
  expect(widths[2]).toBeGreaterThan(widths[1]);
});
