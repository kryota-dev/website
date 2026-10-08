import { expect, test } from "@playwright/test";
import { sections, site } from "./content";

const content = site();
const navSections = sections().filter(({ id }) => id !== "contact");

test("最初の Tab でスキップリンクが見え、Enter で本文に移る", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: content.skipLink });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("ナビにはコンテンツのセクションが順に並ぶ", async ({ page }) => {
  await page.goto("/");
  const links = page
    .getByRole("navigation", { name: content.nav.label })
    .getByRole("link");
  expect(navSections.length).toBeGreaterThan(0);
  await expect(links).toHaveCount(navSections.length);
  for (const [index, section] of navSections.entries()) {
    await expect(links.nth(index)).toHaveText(section.navLabel);
    await expect(links.nth(index)).toHaveAttribute("href", `/#${section.id}`);
  }
});

test("ヘッダーは ロゴ → ナビ → テーマ切替 → 相談ボタン の順にフォーカスする", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: content.nav.label });
  const order = [
    page.getByRole("link", { name: content.name }),
    ...navSections.map((section) =>
      nav.getByRole("link", { name: section.navLabel }),
    ),
    page.getByRole("radio", { name: content.theme.system }),
    page.getByRole("banner").getByRole("link", { name: content.contactCta }),
  ];
  await page.keyboard.press("Tab"); // skip link
  for (const target of order) {
    await page.keyboard.press("Tab");
    await expect(target).toBeFocused();
  }
});
