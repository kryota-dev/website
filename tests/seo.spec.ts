import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { renderOgImage } from "../scripts/og-image.mjs";
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
  const id = path.replaceAll("/", "") as "business" | "privacy";
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

test("トップページは ProfilePage・Person・Organization の JSON-LD を出力する", async ({
  page,
}) => {
  await page.goto("/");
  const scripts = await page
    .locator('head script[type="application/ld+json"]')
    .allTextContents();
  expect(scripts).toHaveLength(1);
  const data = JSON.parse(scripts[0]);
  const home = absolute("/");
  const { person, organization } = site.seo;
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
        jobTitle: person.jobTitle,
        url: home,
        sameAs,
        worksFor: { "@id": `${home}#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${home}#organization`,
        name: organization.name,
        description: organization.description,
        url: home,
        founder: { "@id": `${home}#person` },
        address: {
          "@type": "PostalAddress",
          addressRegion: organization.addressRegion,
          addressCountry: organization.addressCountry,
        },
      },
    ],
  });
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

test.describe("OGP 画像の生成", () => {
  const source = readFileSync("fonts/noto-sans-jp/NotoSansJP-wght.ttf");
  const base = {
    name: "kryota.dev",
    byline: "[氏名] — [肩書き]",
    heading: "[キャッチコピー]",
  };

  test("文言を変えると画像が変わる", async () => {
    const a = await renderOgImage(base, source);
    const b = await renderOgImage(
      { ...base, heading: "[別のキャッチコピー]" },
      source,
    );
    expect(a.equals(b)).toBe(false);
  });

  test("長い見出しは縮めて収め、収まらないほど長ければビルドを失敗させる", async () => {
    const long = "あ".repeat(60);
    const png = await renderOgImage({ ...base, heading: long }, source);
    expect(png.readUInt32BE(16)).toBe(OG_WIDTH);
    expect(png.readUInt32BE(20)).toBe(OG_HEIGHT);
    await expect(
      renderOgImage({ ...base, heading: "あ".repeat(200) }, source),
    ).rejects.toThrow(/heading.*too long/);
  });

  test("フォントにない文字はビルドを失敗させる", async () => {
    await expect(
      renderOgImage({ ...base, heading: "😀" }, source),
    ).rejects.toThrow(/missing from/);
  });
});
