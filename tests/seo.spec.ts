import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { OG_IMAGE } from "../scripts/og-settings.mjs";
import { site as readSite } from "./content";
import { listBuiltPages } from "./pages";

const SITE_URL = "https://kryota.dev";
const site = readSite();
const pages = listBuiltPages();

const absolute = (path: string) => new URL(path, SITE_URL).href;

for (const path of pages) {
  test(`${path} は title・description・canonical・OGP・Twitter Card を持つ`, async ({
    page,
  }) => {
    await page.goto(path);
    const meta = await page.evaluate(() => {
      const content = (selector: string) =>
        document.querySelector(selector)?.getAttribute("content") ?? null;
      return {
        title: document.title,
        description: content('meta[name="description"]'),
        canonical:
          document
            .querySelector('link[rel="canonical"]')
            ?.getAttribute("href") ?? null,
        ogTitle: content('meta[property="og:title"]'),
        ogDescription: content('meta[property="og:description"]'),
        ogUrl: content('meta[property="og:url"]'),
        ogImage: content('meta[property="og:image"]'),
        ogImageWidth: content('meta[property="og:image:width"]'),
        ogImageHeight: content('meta[property="og:image:height"]'),
        ogImageAlt: content('meta[property="og:image:alt"]'),
        ogType: content('meta[property="og:type"]'),
        ogLocale: content('meta[property="og:locale"]'),
        ogSiteName: content('meta[property="og:site_name"]'),
        twitterCard: content('meta[name="twitter:card"]'),
      };
    });
    expect(meta.title).not.toBe("");
    expect(meta.description).toBeTruthy();
    expect(meta.canonical).toBe(absolute(path));
    expect(meta.ogTitle).toBe(meta.title);
    expect(meta.ogDescription).toBe(meta.description);
    expect(meta.ogUrl).toBe(meta.canonical);
    expect(meta.ogImage).toBe(absolute(OG_IMAGE.path));
    expect(meta.ogImageWidth).toBe(String(OG_IMAGE.width));
    expect(meta.ogImageHeight).toBe(String(OG_IMAGE.height));
    expect(meta.ogImageAlt).toBe(site.seo.ogImageAlt);
    expect(meta.ogType).toBe("website");
    expect(meta.ogLocale).toBe(site.seo.locale);
    expect(meta.ogSiteName).toBe(site.name);
    expect(meta.twitterCard).toBe("summary_large_image");
  });
}

test("トップページは Person と ProfessionalService の JSON-LD を出力する", async ({
  page,
}) => {
  await page.goto("/");
  const scripts = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  expect(scripts).toHaveLength(1);
  const data = JSON.parse(scripts[0]);
  expect(data["@context"]).toBe("https://schema.org");
  type Node = Record<string, unknown> & { "@type": string; "@id": string };
  const graph = data["@graph"] as Node[];
  const person = graph.find((node) => node["@type"] === "Person");
  const business = graph.find(
    (node) => node["@type"] === "ProfessionalService",
  );
  expect(person).toMatchObject({
    name: site.seo.person.name,
    jobTitle: site.seo.person.jobTitle,
    url: absolute("/"),
  });
  expect(business).toMatchObject({
    name: site.seo.business.name,
    description: site.seo.business.description,
    url: absolute("/"),
    founder: { "@id": person?.["@id"] },
    address: {
      "@type": "PostalAddress",
      addressRegion: site.seo.business.addressRegion,
      addressCountry: site.seo.business.addressCountry,
    },
  });
  expect(new Set(graph.map((node) => node["@id"])).size).toBe(graph.length);
});

test("sitemap にすべてのページの絶対 URL が載る", () => {
  const index = readFileSync("dist/client/sitemap-index.xml", "utf8");
  const sitemaps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    ([, loc]) => loc,
  );
  expect(sitemaps.length).toBeGreaterThan(0);
  const urls = sitemaps.flatMap((loc) => {
    const file = `dist/client${new URL(loc).pathname}`;
    return [...readFileSync(file, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      ([, url]) => url,
    );
  });
  expect(urls.sort()).toEqual(pages.map(absolute).sort());
});

test("robots.txt は全体を許可し、サイトマップを示す", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.ok()).toBe(true);
  const body = await response.text();
  expect(body).toContain("User-agent: *");
  expect(body).toContain("Allow: /");
  expect(body).toContain(`Sitemap: ${absolute("/sitemap-index.xml")}`);
});

test("OGP 画像は 1200×630 の PNG として配信される", async ({ request }) => {
  const response = await request.get(OG_IMAGE.path);
  expect(response.ok()).toBe(true);
  const png = await response.body();
  // PNG signature, then the IHDR chunk holds width and height (big-endian).
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
  expect(png.readUInt32BE(16)).toBe(OG_IMAGE.width);
  expect(png.readUInt32BE(20)).toBe(OG_IMAGE.height);
});
