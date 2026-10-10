import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { site } from "./content";
import { directiveHashes, readCsp } from "./headers";
import { listBuiltPages } from "./pages";

const csp = readCsp();
const labels = site().theme;
const pages = listBuiltPages();

declare global {
  interface Window {
    cspViolations: string[];
    themeTransitions: ViewTransition[];
  }
}

/** Serves every document with the CSP from _headers, as Workers would. */
async function serveWithCsp(page: Page) {
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), "content-security-policy": csp },
    });
  });
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.cspViolations.push(
        `${event.violatedDirective} ${event.blockedURI} ${event.sample}`,
      );
    });
  });
}

const violations = (page: Page) => page.evaluate(() => window.cspViolations);
const sha256 = (text: string) =>
  `'sha256-${createHash("sha256").update(text).digest("base64")}'`;

test("CSP の hash は全ページのインラインの script と style と過不足なく一致する", async ({
  page,
}) => {
  const scripts = new Set<string>();
  const styles = new Set<string>();
  for (const path of pages) {
    await page.goto(path);
    // Classified in the browser, independently of scripts/csp.mjs: inline
    // scripts except data blocks (JSON), and every inline style.
    const inline = await page.evaluate(() => ({
      scripts: [...document.querySelectorAll("script:not([src])")]
        .filter((element) => !/json/i.test(element.getAttribute("type") ?? ""))
        .map((element) => element.textContent ?? ""),
      styles: [...document.querySelectorAll("style")].map(
        (element) => element.textContent ?? "",
      ),
    }));
    inline.scripts.forEach((text) => scripts.add(sha256(text)));
    inline.styles.forEach((text) => styles.add(sha256(text)));
  }
  expect(directiveHashes(csp, "script-src")).toEqual([...scripts].sort());
  expect(directiveHashes(csp, "style-src")).toEqual([...styles].sort());
});

for (const path of pages) {
  test(`${path} を CSP 付きで開いても違反がない`, async ({ page }) => {
    await serveWithCsp(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await violations(page)).toEqual([]);
  });
}

test("テーマの切り替えと Hero の操作でも CSP の違反がない", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await serveWithCsp(page);
  // Record each View Transition so the test can wait for it to finish.
  await page.addInitScript(() => {
    window.themeTransitions = [];
    const start = document.startViewTransition?.bind(document);
    if (!start) return;
    document.startViewTransition = (...args) => {
      const transition = start(...args);
      window.themeTransitions.push(transition);
      return transition;
    };
  });
  await page.goto("/");

  const heroWeight = () =>
    page
      .locator("#hero-heading")
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--hero-wght"));
  const hero = await page.locator("[data-hero]").boundingBox();
  if (!hero) throw new Error("Hero is not rendered");
  await page.mouse.move(hero.x + hero.width * 0.2, hero.y + hero.height / 2);
  const before = await heroWeight();
  await page.mouse.move(hero.x + hero.width * 0.8, hero.y + hero.height / 2);
  await expect.poll(heroWeight).not.toBe(before);

  const themes = [
    [labels.dark, "dark"],
    [labels.light, "light"],
    [labels.system, null],
  ] as const;
  for (const [name, theme] of themes) {
    await page
      .locator("label", { has: page.getByRole("radio", { name }) })
      .click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe(theme ?? undefined);
  }
  const transitions = await page.evaluate(async () => {
    await Promise.allSettled(window.themeTransitions.map((t) => t.finished));
    return window.themeTransitions.length;
  });
  expect(transitions).toBe(themes.length);
  expect(await violations(page)).toEqual([]);
});
