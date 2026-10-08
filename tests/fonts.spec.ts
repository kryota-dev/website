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

/**
 * Draws text with the given family at each weight and returns the amount of ink.
 * Glyph advances barely change with weight in Japanese (full-width), so width is
 * not a reliable signal; stroke thickness (ink) is.
 */
async function inkAtWeights(page: Page, family: string, weights: number[]) {
  return page.evaluate(
    async ({ family, weights }) => {
      const SAMPLE = "永あア漢";
      const SIZE = 64;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE * SAMPLE.length + SIZE;
      canvas.height = SIZE * 2;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("2D canvas is unavailable");
      const result: number[] = [];
      for (const weight of weights) {
        const font = `${weight} ${SIZE}px "${family}"`;
        await document.fonts.load(font, SAMPLE);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = font;
        context.fillText(SAMPLE, SIZE / 2, SIZE * 1.5);
        const { data } = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        );
        let ink = 0;
        for (let i = 3; i < data.length; i += 4) ink += data[i];
        result.push(ink);
      }
      return result;
    },
    { family, weights },
  );
}

test("Hero の見出しは和文フォントで描画され、wght の変化が太さに連続的に反映される", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const family = await page.evaluate((name) => {
    const face = [...document.fonts].find(
      (f) =>
        f.family.replace(/"/g, "").startsWith(`${name}-`) &&
        !f.family.includes("fallback") &&
        f.status === "loaded",
    );
    return face?.family.replace(/"/g, "") ?? null;
  }, NOTO_FAMILY);
  expect(family).not.toBeNull();

  const headingFamily = await page
    .locator("#hero-heading")
    .evaluate((el) =>
      getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "").trim(),
    );
  expect(headingFamily).toBe(family);

  // The face is the served subset itself (unique, hashed family name). A variable
  // face thickens at every step; a static (non-variable) face renders 300, 400
  // and 500 identically, so this fails if the wght axis is lost.
  const ink = await inkAtWeights(page, family!, [300, 400, 500]);
  expect(ink[1]).toBeGreaterThan(ink[0]);
  expect(ink[2]).toBeGreaterThan(ink[1]);
});
