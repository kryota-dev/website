import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { expect, test, type Page } from "@playwright/test";
import { ICONS } from "../scripts/icon-settings.mjs";
import { renderIcon } from "../scripts/icons.mjs";
import {
  layoutText,
  NAME_SIZES,
  OG_TEXT_WIDTH,
  renderOgImage,
} from "../scripts/og-image.mjs";
import { personRole } from "../scripts/person.mjs";
import { serializeJsonLd } from "../src/lib/json-ld";
import { legal, profile, site as readSite } from "./content";
import { listBuiltPages } from "./pages";

const SITE_URL = "https://kryota.dev";
/** Fixed by the requirements (AC-033 / AC-036), not read from the code. */
const OG_PATH = "/og.png";
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

const site = readSite();
const pages = listBuiltPages();
const absolute = (path: string) => new URL(path, SITE_URL).href;

/** Expected title and description per page, from the Markdown. */
function expectedText(path: string) {
  if (path === "/") return { title: site.name, description: site.description };
  const id = path.replaceAll("/", "") as "privacy";
  const page = legal(id);
  return {
    title: `${page.title} | ${site.name}`,
    description: page.description,
  };
}

const HEAD_TAGS = {
  description: 'meta[name="description"]',
  canonical: 'link[rel="canonical"]',
  "og:type": 'meta[property="og:type"]',
  "og:site_name": 'meta[property="og:site_name"]',
  "og:locale": 'meta[property="og:locale"]',
  "og:title": 'meta[property="og:title"]',
  "og:description": 'meta[property="og:description"]',
  "og:url": 'meta[property="og:url"]',
  "og:image": 'meta[property="og:image"]',
  "og:image:width": 'meta[property="og:image:width"]',
  "og:image:height": 'meta[property="og:image:height"]',
  "og:image:alt": 'meta[property="og:image:alt"]',
  "twitter:card": 'meta[name="twitter:card"]',
} as const;

for (const path of pages) {
  test(`${path} は title・description・canonical・OGP・Twitter Card を head に 1 つずつ持つ`, async ({
    page,
  }) => {
    await page.goto(path);
    const tags = await page.evaluate((selectors) => {
      const result: Record<
        string,
        { inHead: number; total: number; value: string | null }
      > = {};
      for (const [key, selector] of Object.entries(selectors)) {
        const all = document.querySelectorAll(selector);
        const element = document.head.querySelector(selector);
        result[key] = {
          inHead: document.head.querySelectorAll(selector).length,
          total: all.length,
          value:
            element?.getAttribute("content") ??
            element?.getAttribute("href") ??
            null,
        };
      }
      return {
        title: document.title,
        titles: document.querySelectorAll("title").length,
        result,
      };
    }, HEAD_TAGS);

    expect(tags.titles).toBe(1);
    for (const [key, { inHead, total }] of Object.entries(tags.result)) {
      expect({ key, inHead, total }).toEqual({ key, inHead: 1, total: 1 });
    }
    const value = (key: keyof typeof HEAD_TAGS) => tags.result[key].value;
    const { title, description } = expectedText(path);
    expect(tags.title).toBe(title);
    expect(value("description")).toBe(description);
    expect(value("canonical")).toBe(absolute(path));
    expect(value("og:title")).toBe(title);
    expect(value("og:description")).toBe(description);
    expect(value("og:url")).toBe(absolute(path));
    expect(value("og:image")).toBe(absolute(OG_PATH));
    expect(value("og:image:width")).toBe(String(OG_WIDTH));
    expect(value("og:image:height")).toBe(String(OG_HEIGHT));
    expect(value("og:image:alt")).toBe(site.seo.ogImageAlt);
    expect(value("og:type")).toBe("website");
    expect(value("og:locale")).toBe(site.seo.locale);
    expect(value("og:site_name")).toBe(site.name);
    expect(value("twitter:card")).toBe("summary_large_image");
  });
}

test("トップページは ProfilePage と Person の JSON-LD を出力する（Organization は出さない）", async ({
  page,
}) => {
  await page.goto("/");
  const scripts = await page
    .locator('head script[type="application/ld+json"]')
    .allTextContents();
  expect(scripts).toHaveLength(1);
  const data = JSON.parse(scripts[0]);
  const home = absolute("/");
  const { person } = site.seo;
  const sameAs = profile()
    .links.map(({ href }) => href)
    .filter((href) => href.startsWith("https:"));
  expect(data).toEqual({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${home}#profile-page`,
        url: home,
        name: site.name,
        mainEntity: { "@id": `${home}#person` },
      },
      {
        "@type": "Person",
        "@id": `${home}#person`,
        name: person.name,
        alternateName: person.alternateName,
        jobTitle: person.jobTitle,
        url: home,
        sameAs,
        address: {
          "@type": "PostalAddress",
          addressRegion: person.addressRegion,
          addressCountry: person.addressCountry,
        },
      },
    ],
  });
});

test("OGP 画像の代替テキストは、画像に描く名前・肩書き・サイト名を含む", () => {
  const { person } = site.seo;
  const role = `${person.alternateName} / ${person.jobTitle}`;
  expect(personRole(person)).toBe(role);
  for (const text of [site.name, person.name, role]) {
    expect(site.seo.ogImageAlt).toContain(text);
  }
});

test("JSON-LD は script を閉じられない形で出力し、元の値に戻せる", () => {
  const value = { name: "</script><!-- <script>alert(1)</script> -->" };
  const json = serializeJsonLd(value);
  expect(json).not.toContain("<");
  expect(JSON.parse(json)).toEqual(value);
});

test("sitemap にすべてのページの絶対 URL が載り、参照先はすべて自サイト", () => {
  const locs = (xml: string) =>
    [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc);
  const sitemaps = locs(readFileSync("dist/client/sitemap-index.xml", "utf8"));
  expect(sitemaps.length).toBeGreaterThan(0);
  const urls = sitemaps.flatMap((loc) => {
    expect(new URL(loc).origin).toBe(SITE_URL);
    return locs(readFileSync(`dist/client${new URL(loc).pathname}`, "utf8"));
  });
  expect(urls.sort()).toEqual(pages.map(absolute).sort());
});

test("robots.txt は全体を許可し、サイトマップを示す（ほかの指示を持たない）", async ({
  request,
}) => {
  const response = await request.get("/robots.txt");
  expect(response.ok()).toBe(true);
  const lines = (await response.text())
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  expect(lines).toEqual([
    "User-agent: *",
    "Allow: /",
    `Sitemap: ${absolute("/sitemap-index.xml")}`,
  ]);
});

test("OGP 画像は 1200×630 の画像としてデコードできる", async ({ page }) => {
  await page.goto("/");
  const size = await page.evaluate(async (path) => {
    const image = new Image();
    image.src = path;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, OG_PATH);
  expect(size).toEqual({ width: OG_WIDTH, height: OG_HEIGHT });
});

/** Fixed by the requirements (AC-A03), not read from the code. */
const FAVICON_SIZE = 32;
const TOUCH_ICON_SIZE = 180;
/** The avatar sits right of the text column (AC-A04): x from here to the edge. */
const OG_AVATAR_MIN_X = 80 + OG_TEXT_WIDTH;

/** A PNG with nothing drawn, to render the layout without the figure. */
const blankPng = () =>
  new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')
    .render()
    .asPng();

/** Bounding box of the pixels that differ between two PNGs of the same size. */
async function diffBox(page: Page, a: Buffer, b: Buffer) {
  const urls = [a, b].map(
    (png) => `data:image/png;base64,${png.toString("base64")}`,
  );
  return page.evaluate(async ([first, second]) => {
    const pixels = async (src: string) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2D canvas is unavailable");
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    };
    const [x, y] = [await pixels(first), await pixels(second)];
    const box = { minX: Infinity, minY: Infinity, maxX: -1, maxY: -1 };
    for (let i = 0; i < x.data.length; i += 4) {
      if (x.data.slice(i, i + 4).every((v, k) => v === y.data[i + k])) continue;
      const px = (i / 4) % x.width;
      const py = Math.floor(i / 4 / x.width);
      box.minX = Math.min(box.minX, px);
      box.minY = Math.min(box.minY, py);
      box.maxX = Math.max(box.maxX, px);
      box.maxY = Math.max(box.maxY, py);
    }
    return box;
  }, urls);
}

test.describe("OGP 画像の生成", () => {
  const source = readFileSync("fonts/noto-sans-jp/NotoSansJP-wght.ttf");
  const avatar = readFileSync("src/assets/avatar.png");
  const base = {
    site: "kryota.dev",
    name: "[氏名]",
    role: "[ふりがな] / [肩書き]",
  };

  test("サイト名・名前・肩書きのどれを変えても画像が変わる", async () => {
    const a = await renderOgImage(base, source, avatar);
    for (const field of ["site", "name", "role"] as const) {
      const b = await renderOgImage(
        { ...base, [field]: `[別の${field}]` },
        source,
        avatar,
      );
      expect(a.equals(b), field).toBe(false);
    }
  });

  test("アバターは文字の列の右に描き、文字の領域には描かない", async ({
    page,
  }) => {
    const box = await diffBox(
      page,
      await renderOgImage(base, source, avatar),
      await renderOgImage(base, source, blankPng()),
    );
    expect(box.maxX).toBeGreaterThan(box.minX);
    expect(box.minX).toBeGreaterThanOrEqual(OG_AVATAR_MIN_X);
    expect(box.maxX).toBeLessThan(OG_WIDTH - 80);
  });

  test("名前は実際の字幅で測って縮め、最小でも 1 行に収まらなければ失敗させる", () => {
    const size = (name: string) =>
      layoutText({ ...base, name }, source).nameSize;
    expect(size("Ryota Kaneko")).toBe(NAME_SIZES[0]);
    // Wide and narrow Latin letters differ by more than 3×: W is 0.84em, i 0.25em.
    const wide = size("W".repeat(14));
    expect(wide).toBeLessThan(NAME_SIZES[0]);
    expect(size("i".repeat(14))).toBe(NAME_SIZES[0]);
    expect(size("i".repeat(30))).toBeGreaterThan(wide);
    expect(() => size("W".repeat(20))).toThrow(/name.*too long/);
  });

  test("アバターの横に収まらない肩書きと、1 行に収まらないサイト名は失敗させる", () => {
    expect(() => layoutText({ ...base, role: "W".repeat(30) }, source)).toThrow(
      /role.*does not fit/,
    );
    expect(() => layoutText({ ...base, site: "W".repeat(30) }, source)).toThrow(
      /site.*does not fit/,
    );
  });

  test("フォントにない文字はビルドを失敗させる", async () => {
    await expect(
      renderOgImage({ ...base, role: "😀" }, source, avatar),
    ).rejects.toThrow(/missing from/);
  });
});

test.describe("favicon と apple-touch-icon", () => {
  test("head に link があり、要件の大きさの PNG が配信される", async ({
    page,
  }) => {
    expect(ICONS.favicon.size).toBe(FAVICON_SIZE);
    expect(ICONS.appleTouch.size).toBe(TOUCH_ICON_SIZE);
    await page.goto("/");
    const icon = page.locator('head link[rel="icon"]');
    await expect(icon).toHaveCount(1);
    await expect(icon).toHaveAttribute("href", ICONS.favicon.path);
    await expect(icon).toHaveAttribute("type", "image/png");
    await expect(icon).toHaveAttribute(
      "sizes",
      `${FAVICON_SIZE}x${FAVICON_SIZE}`,
    );
    const touch = page.locator('head link[rel="apple-touch-icon"]');
    await expect(touch).toHaveCount(1);
    await expect(touch).toHaveAttribute("href", ICONS.appleTouch.path);
    for (const [path, size] of [
      [ICONS.favicon.path, FAVICON_SIZE],
      [ICONS.appleTouch.path, TOUCH_ICON_SIZE],
    ] as const) {
      const decoded = await page.evaluate(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
      }, path);
      expect(decoded, path).toEqual({ width: size, height: size });
    }
  });

  test("人物を描き、favicon は角が透明な円、apple-touch-icon は角まで塗る", async ({
    page,
  }) => {
    await page.goto("/");
    const stats = await page.evaluate(
      async (paths) => {
        const read = async (src: string) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("2D canvas is unavailable");
          context.drawImage(image, 0, 0);
          const { data } = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          );
          // The figure is dark; the circle and the square are light.
          let dark = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 0 && data[i] + data[i + 1] + data[i + 2] < 3 * 96)
              dark += 1;
          }
          return { cornerAlpha: data[3], darkShare: dark / (data.length / 4) };
        };
        return Promise.all(paths.map(read));
      },
      [ICONS.favicon.path, ICONS.appleTouch.path],
    );
    const [favicon, touch] = stats;
    expect(favicon.cornerAlpha).toBe(0);
    expect(touch.cornerAlpha).toBe(255);
    for (const { darkShare } of stats) expect(darkShare).toBeGreaterThan(0.2);
  });

  test("切り出しが元画像の外にはみ出す、または不正な値なら失敗する", () => {
    const avatar = readFileSync("src/assets/avatar.png");
    const icon = (crop: { x: number; y: number; size: number }) => () =>
      renderIcon(avatar, { size: 32, shape: "circle", crop });
    expect(icon({ x: 300, y: 0, size: 200 })).toThrow(/outside the avatar/);
    expect(icon({ x: Number.NaN, y: 0, size: 200 })).toThrow(/invalid/);
    expect(icon({ x: 0, y: 0, size: 0 })).toThrow(/invalid/);
  });

  test("元画像が想定の大きさでなければ失敗する", () => {
    expect(() =>
      renderIcon(blankPng(), {
        size: 32,
        shape: "circle",
        crop: { x: 0, y: 0, size: 1 },
      }),
    ).toThrow(/400×400/);
  });
});
