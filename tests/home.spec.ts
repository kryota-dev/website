import { expect, test } from "@playwright/test";
import { profile, sections, works } from "./content";

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

test("Works のカードは新しい順に、概要・役割・主な取り組み・技術スタックを持つ", async ({
  page,
}) => {
  const cards = page.locator("#works .card");
  const expected = works();
  await expect(cards).toHaveCount(expected.length);
  for (const [index, work] of expected.entries()) {
    const card = cards.nth(index);
    await expect(card).toHaveAttribute("data-entry", work.id);
    await expect(card.getByRole("heading", { level: 3 })).toHaveText(
      work.title,
    );
    await expect(card.locator(".summary")).not.toBeEmpty();
    const fact = (label: string) =>
      card.locator(".fact").filter({
        has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }),
      });
    const role = fact(work.labels.role);
    await expect(role.locator("dd")).toHaveText(work.role);
    const highlights = fact(work.labels.highlights).getByRole("listitem");
    await expect(highlights).toHaveText(work.highlights);
    await expect(
      card.getByRole("list", { name: work.labels.tech }).getByRole("listitem"),
    ).toHaveText(work.tech);
  }
});

test("Profile は資格・活動・外部リンクを、見出しの下にデータの順で並べる", async ({
  page,
}) => {
  const content = profile();
  const section = page.locator("#profile");
  const block = (label: string) =>
    section.locator(".block").filter({
      has: page.getByRole("heading", { level: 3, name: label, exact: true }),
    });

  const qualifications = block(content.qualificationsLabel);
  await expect(qualifications.locator("dt")).toHaveText(
    content.qualifications.map(({ date }) => date),
  );
  await expect(qualifications.locator("dd")).toHaveText(
    content.qualifications.map(({ name, note }) => `${name}${note ?? ""}`),
  );

  const activities = block(content.activitiesLabel);
  await expect(activities.locator("dt")).toHaveText(
    content.activities.map(({ period }) => period),
  );
  await expect(activities.locator("dd")).toHaveText(
    content.activities.map(({ title, detail }) => `${title}${detail ?? ""}`),
  );

  const links = block(content.linksLabel).getByRole("link");
  await expect(links).toHaveCount(content.links.length);
  for (const [index, { label, href }] of content.links.entries()) {
    await expect(links.nth(index)).toHaveAccessibleName(label);
    await expect(links.nth(index)).toHaveAttribute("href", href);
  }
});
