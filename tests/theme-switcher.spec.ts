import { expect, test, type Page } from "@playwright/test";

const themeAttribute = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.theme ?? null);

const savedTheme = (page: Page) =>
  page.evaluate(() => localStorage.getItem("theme"));

/** Clicks the visible segment (label) that wraps the radio, as a user would. */
const choose = (page: Page, name: string) =>
  page.locator("label", { has: page.getByRole("radio", { name }) }).click();

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
});

test("既定ではシステムが選ばれ、data-theme は付かない", async ({ page }) => {
  await expect(page.getByRole("radio", { name: "システム" })).toBeChecked();
  expect(await themeAttribute(page)).toBeNull();
});

for (const theme of ["light", "dark"] as const) {
  const name = theme === "light" ? "ライト" : "ダーク";

  test(`${name}を選ぶと保存され、再読み込みしても描画前に適用される`, async ({
    page,
  }) => {
    await choose(page, name);
    await expect(page.getByRole("radio", { name })).toBeChecked();
    await expect.poll(() => themeAttribute(page)).toBe(theme);
    expect(await savedTheme(page)).toBe(theme);

    // Record the attribute as soon as the document is parsed, before load.
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        (window as unknown as { themeAtParse: string | null }).themeAtParse =
          document.documentElement.dataset.theme ?? null;
      });
    });
    await page.reload();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { themeAtParse: string | null }).themeAtParse,
      ),
    ).toBe(theme);
    await expect(page.getByRole("radio", { name })).toBeChecked();
  });
}

test("システムに戻すと data-theme と保存値が消える", async ({ page }) => {
  await choose(page, "ダーク");
  await expect.poll(() => themeAttribute(page)).toBe("dark");
  await choose(page, "システム");
  await expect.poll(() => themeAttribute(page)).toBeNull();
  expect(await savedTheme(page)).toBeNull();
});

test("矢印キーで選択肢を移動して選べる", async ({ page }) => {
  await page.getByRole("radio", { name: "システム" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "ライト" })).toBeChecked();
  await expect.poll(() => themeAttribute(page)).toBe("light");
});

test("localStorage が使えなくても例外を出さずにシステムとして動く", async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const deny = () => {
      throw new DOMException("denied", "SecurityError");
    };
    Storage.prototype.getItem = deny;
    Storage.prototype.setItem = deny;
    Storage.prototype.removeItem = deny;
  });
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));

  await page.goto("/");
  await expect(page.getByRole("radio", { name: "システム" })).toBeChecked();
  await choose(page, "ダーク");
  await expect.poll(() => themeAttribute(page)).toBe("dark");
  expect(errors).toEqual([]);
  await context.close();
});
