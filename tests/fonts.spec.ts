import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { create, type Font } from "fontkit";
import { collectCharacters } from "../scripts/subset-fonts.mjs";
import { listBuiltPages } from "./pages";

const DIST_DIR = "dist/client";
const NOTO_FAMILY = "Noto Sans JP";
const PLEX_FAMILY = "IBM Plex Mono";
const FONT_FACE = /@font-face\s*\{[^}]*\}/g;
/** A kanji in the original font that the pages do not use. */
const UNUSED_KANJI = 0x9fa0; // 龠

const pageFile = (path: string) =>
  join(DIST_DIR, path.endsWith("/") ? `${path}index.html` : `${path}.html`);

const fontFaces = (html: string) => html.match(FONT_FACE) ?? [];

/** @font-face rules of a family (excluding Astro's generated fallbacks). */
const facesOf = (html: string, family: string) =>
  fontFaces(html).filter(
    (rule) =>
      rule.includes(`font-family:"${family}-`) && !rule.includes("fallback"),
  );

function fontUrl(html: string, family: string): string {
  const url = facesOf(html, family)[0]?.match(/src:url\("([^"]+)"\)/)?.[1];
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
const subsetChars = readFileSync(
  ".generated/fonts/noto-sans-jp.chars.txt",
  "utf8",
);

test.describe("出力 HTML", () => {
  for (const path of pages) {
    test(`${path} はフォントを自サイトからだけ読み込み、和文フォントを preload する`, () => {
      const html = readFileSync(pageFile(path), "utf8");
      for (const rule of fontFaces(html)) {
        for (const [, source] of rule.matchAll(/url\("([^"]+)"\)/g)) {
          expect(source).toMatch(/^\/_astro\/fonts\/[^/]+\.woff2$/);
        }
      }
      expect(html).toContain(
        `<link rel="preload" href="${notoUrl}" as="font" type="font/woff2" crossorigin>`,
      );
    });
  }

  test("Noto Sans JP（100〜900）と IBM Plex Mono（400 / 500）を swap で宣言する", () => {
    const noto = facesOf(indexHtml, NOTO_FAMILY);
    expect(noto).toHaveLength(1);
    expect(noto[0]).toContain("font-weight:100 900");
    const plex = facesOf(indexHtml, PLEX_FAMILY);
    expect(
      plex.map((rule) => rule.match(/font-weight:(\d+)/)?.[1]).sort(),
    ).toEqual(["400", "500"]);
    for (const rule of [...noto, ...plex])
      expect(rule).toContain("font-display:swap");
  });

  test("メトリクスを調整したフォールバックを宣言する", () => {
    for (const family of [NOTO_FAMILY, PLEX_FAMILY]) {
      const fallback = fontFaces(indexHtml).find(
        (rule) =>
          rule.includes(`font-family:"${family}-`) && rule.includes("fallback"),
      );
      expect(fallback, family).toMatch(/size-adjust:[\d.]+%/);
    }
  });
});

test.describe("配信する和文フォント", () => {
  test("wght 軸（100〜900）を保つ", () => {
    expect(noto.variationAxes.wght).toMatchObject({ min: 100, max: 900 });
  });

  test("使用文字だけのサブセットで、元のフォントの未使用の文字を含まない", () => {
    expect(noto.hasGlyphForCodePoint(UNUSED_KANJI)).toBe(false);
    expect(noto.characterSet.length).toBeLessThanOrEqual(
      [...subsetChars].length + 16,
    );
  });

  test("OFL のライセンスの記述（name ID 14）を保つ", () => {
    expect(noto.copyright).toBeTruthy();
    expect(noto.getName("licenseURL", "en")).toMatch(/OFL/);
  });
});

test("文字参照は HTML の規則でデコードして集める", async () => {
  const dir = mkdtempSync(join(tmpdir(), "subset-fixture-"));
  try {
    writeFileSync(
      join(dir, "index.html"),
      "<p>&hellip; &eacute; &#12354 &#x1F600; &#x110000;</p>",
    );
    const chars = await collectCharacters(dir);
    for (const char of ["…", "é", "あ", "😀"]) expect(chars).toContain(char);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

test("フォントのリクエストはすべて自サイトの origin に向かう", async ({
  page,
  baseURL,
}) => {
  const fontRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "font") fontRequests.push(request.url());
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  expect(fontRequests.length).toBeGreaterThan(0);
  for (const url of fontRequests)
    expect(new URL(url).origin).toBe(new URL(baseURL!).origin);
});

test("等幅の要素は IBM Plex Mono で描画される", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const family = await page
    .locator("header a.logo")
    .evaluate((el) =>
      getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, ""),
    );
  expect(family.startsWith(`${PLEX_FAMILY}-`)).toBe(true);
});

/** The loaded @font-face family name of the served Noto Sans JP subset. */
async function notoFamily(page: Page): Promise<string> {
  const family = await page.evaluate((name) => {
    const face = [...document.fonts].find(
      (f) =>
        f.family.replace(/"/g, "").startsWith(`${name}-`) &&
        !f.family.includes("fallback") &&
        f.status === "loaded",
    );
    return face?.family.replace(/"/g, "") ?? null;
  }, NOTO_FAMILY);
  if (!family) throw new Error(`${NOTO_FAMILY} is not loaded`);
  return family;
}

/**
 * Sets the hero's --hero-wght, then draws the heading's own text on a canvas
 * with the heading's computed font and returns the amount of ink. Glyph advances
 * barely change with weight in Japanese, so ink (stroke thickness) is measured.
 */
async function heroInkAt(
  page: Page,
  family: string,
  weight: number,
  sample: string,
) {
  return page.locator("#hero-heading").evaluate(
    async (heading, { family, weight, sample }) => {
      heading.style.transition = "none";
      heading.style.setProperty("--hero-wght", String(weight));
      const style = getComputedStyle(heading);
      const font = `${style.fontWeight} 64px ${style.fontFamily}`;
      // Load only the served face: Astro's fallback faces use local() fonts
      // (e.g. Arial) that may be missing and would reject the whole load.
      await document.fonts.load(`${style.fontWeight} 64px "${family}"`, sample);
      const canvas = document.createElement("canvas");
      canvas.width = 64 * (sample.length + 1);
      canvas.height = 128;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("2D canvas is unavailable");
      context.font = font;
      context.fillText(sample, 32, 96);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let ink = 0;
      for (let i = 3; i < data.length; i += 4) ink += data[i];
      return {
        ink,
        weight: style.fontWeight,
        variation: style.fontVariationSettings,
      };
    },
    { family, weight, sample },
  );
}

test("Hero の wght の変化が、配信した和文フォントの描画の太さに連続的に反映される", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const family = await notoFamily(page);
  const heading = page.locator("#hero-heading");
  const headingFamily = await heading.evaluate((el) =>
    getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "").trim(),
  );
  expect(headingFamily).toBe(family);

  // Use the heading's own non-ASCII characters that the served subset covers,
  // so the ink comes from this face and not from a system fallback.
  const text = await heading.innerText();
  const sample = [...new Set(text)]
    .filter(
      (char) =>
        char > "\u007f" && noto.hasGlyphForCodePoint(char.codePointAt(0)!),
    )
    .join("");
  expect(sample.length).toBeGreaterThan(0);

  // A variable face thickens at every step; a static face renders 300, 400 and
  // 500 identically, so this fails if the wght axis or the hero wiring is lost.
  const results = [];
  for (const weight of [300, 400, 500])
    results.push(await heroInkAt(page, family, weight, sample));
  expect(results.map(({ weight }) => weight)).toEqual(["300", "400", "500"]);
  expect(results.map(({ variation }) => variation)).toEqual([
    '"wght" 300',
    '"wght" 400',
    '"wght" 500',
  ]);
  expect(results[1].ink).toBeGreaterThan(results[0].ink);
  expect(results[2].ink).toBeGreaterThan(results[1].ink);
});
