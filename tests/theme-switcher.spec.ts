import { expect, test, type Page } from "@playwright/test";
import { site } from "./content";

const labels = site().theme;

const themeAttribute = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.theme ?? null);

const savedTheme = (page: Page) =>
  page.evaluate(() => localStorage.getItem("theme"));

const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

const DARK_BG = "rgb(22, 21, 17)";

/** Clicks the visible segment (label) that wraps the radio, as a user would. */
const choose = (page: Page, name: string) =>
  page.locator("label", { has: page.getByRole("radio", { name }) }).click();

test.describe("reduced motion（即時に切り替わる）", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
  });

  test("既定ではシステムが選ばれ、data-theme は付かない", async ({ page }) => {
    await expect(
      page.getByRole("radio", { name: labels.system }),
    ).toBeChecked();
    expect(await themeAttribute(page)).toBeNull();
  });

  for (const theme of ["light", "dark"] as const) {
    test(`${theme} を選ぶと保存され、再読み込み後も選択が復元される`, async ({
      page,
    }) => {
      await choose(page, labels[theme]);
      await expect(
        page.getByRole("radio", { name: labels[theme] }),
      ).toBeChecked();
      await expect.poll(() => themeAttribute(page)).toBe(theme);
      expect(await savedTheme(page)).toBe(theme);

      await page.reload();
      expect(await themeAttribute(page)).toBe(theme);
      await expect(
        page.getByRole("radio", { name: labels[theme] }),
      ).toBeChecked();
    });
  }

  test("システムに戻すと data-theme と保存値が消える", async ({ page }) => {
    await choose(page, labels.dark);
    await expect.poll(() => themeAttribute(page)).toBe("dark");
    await choose(page, labels.system);
    await expect.poll(() => themeAttribute(page)).toBeNull();
    expect(await savedTheme(page)).toBeNull();
  });

  test("矢印キーで選択肢を移動して選べる", async ({ page }) => {
    await page.getByRole("radio", { name: labels.system }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: labels.light })).toBeChecked();
    await expect.poll(() => themeAttribute(page)).toBe("light");
  });
});

test("保存したテーマは、JS のモジュールを読み込む前（head の同期処理だけ）で適用される", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  // Block every bundled script: only the inline head script can apply the theme.
  await page.route("**/_astro/*.js", (route) => route.abort());
  await page.goto("/");
  expect(await themeAttribute(page)).toBe("dark");
  expect(await bodyBackground(page)).toBe(DARK_BG);
});

test.describe("通常の動き（View Transition を通る）", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
  });

  test("View Transition を使って切り替え、エラーを出さない", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.addInitScript(() => {
      const original = document.startViewTransition?.bind(document);
      if (!original) return;
      (window as unknown as { transitions: number }).transitions = 0;
      document.startViewTransition = ((update) => {
        (window as unknown as { transitions: number }).transitions += 1;
        return original(update);
      }) as typeof document.startViewTransition;
    });
    await page.goto("/");

    await choose(page, labels.dark);
    await expect.poll(() => themeAttribute(page)).toBe("dark");
    expect(
      await page.evaluate(
        () => (window as unknown as { transitions?: number }).transitions,
      ),
    ).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("連続して切り替えても最後の選択が残り、エラーを出さない", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/");

    await choose(page, labels.dark);
    await choose(page, labels.light);
    await choose(page, labels.dark);
    await expect.poll(() => themeAttribute(page)).toBe("dark");
    expect(await savedTheme(page)).toBe("dark");
    expect(errors).toEqual([]);
  });

  test("View Transition が使えない環境では即時に切り替わる", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(Document.prototype, "startViewTransition");
    });
    await page.goto("/");
    await choose(page, labels.dark);
    await expect.poll(() => themeAttribute(page)).toBe("dark");
  });
});

test("localStorage が使えなくても例外を出さず、そのページでは選んだテーマを使う", async ({
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
  await expect(page.getByRole("radio", { name: labels.system })).toBeChecked();
  await choose(page, labels.dark);
  await expect.poll(() => themeAttribute(page)).toBe("dark");
  expect(errors).toEqual([]);
  await context.close();
});
