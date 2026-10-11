import { expect, test } from "@playwright/test";
import { sections } from "./content";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("セクションはコンテンツの順番どおりに並ぶ", async ({ page }) => {
  const ids = await page
    .locator("main > section[id]")
    .evaluateAll((list) => list.map((section) => section.id));
  expect(ids).toEqual(sections().map(({ id }) => id));
});

test.describe("Contact", () => {
  const contact = (page: import("@playwright/test").Page) =>
    page.locator("#contact");

  test("フォームを持たない", async ({ page }) => {
    await expect(contact(page).locator("form, input, textarea")).toHaveCount(0);
  });

  test("外部リンクには ↗ が見え、リンクの名前には含まれない", async ({
    page,
  }) => {
    const links = contact(page).locator('a[href^="https://"]');
    expect(await links.count()).toBeGreaterThan(0);
    for (const link of await links.all()) {
      const marker = await link.evaluate(
        (el) => getComputedStyle(el, "::after").content,
      );
      expect(marker).toContain("↗");
      const text = (await link.textContent())?.trim() ?? "";
      await expect(link).toHaveAccessibleName(text);
      // Same tab, like the other links on the site.
      await expect(link).not.toHaveAttribute("target");
    }
  });
});
