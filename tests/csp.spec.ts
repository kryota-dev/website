import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { site } from "./content";
import { readCsp } from "./headers";
import { listBuiltPages } from "./pages";

const csp = readCsp();
const labels = site().theme;

declare global {
  interface Window {
    cspViolations: string[];
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

for (const path of listBuiltPages()) {
  test(`${path} のインラインの script と style はすべて CSP の hash に含まれる`, async ({
    page,
  }) => {
    await page.goto(path);
    const inline = await page.evaluate(() =>
      [...document.querySelectorAll("script:not([src]), style")]
        .filter(
          (element) =>
            element.localName === "style" ||
            !(element.getAttribute("type") ?? "").includes("json"),
        )
        .map((element) => element.textContent ?? ""),
    );
    expect(inline.length).toBeGreaterThan(0);
    for (const text of inline) {
      const hash = createHash("sha256").update(text).digest("base64");
      expect(csp).toContain(`'sha256-${hash}'`);
    }
  });

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
  await page.goto("/");

  const hero = await page.locator("[data-hero]").boundingBox();
  if (!hero) throw new Error("Hero is not rendered");
  await page.mouse.move(hero.x + hero.width * 0.2, hero.y + hero.height / 2);
  await page.mouse.move(hero.x + hero.width * 0.8, hero.y + hero.height / 2);

  for (const name of [labels.dark, labels.light, labels.system]) {
    await page
      .locator("label", { has: page.getByRole("radio", { name }) })
      .click();
    await expect(page.getByRole("radio", { name })).toBeChecked();
  }
  // Let the View Transition finish before reading the violations.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((animation) =>
              (
                animation.effect as KeyframeEffect | null
              )?.pseudoElement?.startsWith("::view-transition"),
            ).length,
      ),
    )
    .toBe(0);
  expect(await violations(page)).toEqual([]);
});
