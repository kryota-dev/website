import { expect, test, type Page } from "@playwright/test";
import {
  markdownLinks,
  profile,
  readBody,
  sections,
  skills,
  works,
} from "./content";
import { expectExternalLink } from "./external-link";
import { listBuiltPages } from "./pages";

/** Fixed by the requirements (AC-001), not read from the content. */
const SECTION_ORDER = ["hero", "profile", "works", "skills", "contact"];
/** At least --space-4 (16px) between consecutive paragraphs. */
const MIN_PARAGRAPH_GAP = 16;
/** At least --space-8 (32px) before a heading in a Markdown body. */
const MIN_HEADING_GAP = 32;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("セクションは Hero → Profile → Works → Skills → Contact の順に並ぶ", async ({
  page,
}) => {
  const ids = await page
    .locator("main > section")
    .evaluateAll((list) =>
      list.map((section) =>
        section.hasAttribute("data-hero") ? "hero" : section.id,
      ),
    );
  expect(ids).toEqual(SECTION_ORDER);
});

test("セクション見出しは絵文字と見出しだけを持ち、絵文字は読み上げに含めない", async ({
  page,
}) => {
  for (const { id, icon, heading } of sections()) {
    const section = page.locator(`#${id}`);
    const icons = section.locator(".heading-row .icon");
    await expect(icons).toHaveCount(1);
    await expect(icons).toHaveText(icon);
    await expect(icons).toHaveAttribute("aria-hidden", "true");
    await expect(
      section.getByRole("heading", { level: 2 }),
    ).toHaveAccessibleName(heading);
    // No section numbers ("01" and so on).
    await expect(section.locator(".heading-row")).not.toContainText(/\b0\d\b/);
  }
});

test.describe("Contact", () => {
  const contact = (page: Page) => page.locator("#contact");

  test("ページのどこにもフォームと入力欄が無く、Contact にボタンも無い", async ({
    page,
  }) => {
    await expect(
      page.locator("form, input:not([type=radio]), textarea, select"),
    ).toHaveCount(0);
    await expect(contact(page).getByRole("button")).toHaveCount(0);
  });

  test("本文のリンクがそのまま並び、外部リンクは ↗ が付いて新しいタブで開く", async ({
    page,
  }) => {
    const expected = markdownLinks(readBody("sections/contact.md"));
    expect(expected.length).toBeGreaterThan(0);
    const links = contact(page).getByRole("link");
    await expect(links).toHaveCount(expected.length);
    for (const [index, { label, href }] of expected.entries()) {
      const link = links.nth(index);
      await expect(link).toHaveAttribute("href", href);
      await expectExternalLink(link, label);
    }
  });
});

test("Works のカードは新しい順に、業種・期間・見出し・概要・役割・主な取り組み・技術スタックを持つ", async ({
  page,
}) => {
  const cards = page.locator("#works .card");
  const expected = works();
  await expect(cards).toHaveCount(expected.length);
  for (const [index, work] of expected.entries()) {
    const card = cards.nth(index);
    await expect(card).toHaveAttribute("data-entry", work.id);
    await expect(card.locator(".meta")).toHaveText(
      `${work.industry}${work.period}`,
    );
    await expect(card.getByRole("heading", { level: 3 })).toHaveText(
      work.title,
    );
    await expect(card.locator(".summary")).toHaveText(work.body);
    await expect(card.locator(".facts dt")).toHaveText([work.labels.role]);
    await expect(card.locator(".facts dd")).toHaveText([work.role]);
    await expect(
      card.getByRole("heading", { level: 4, name: work.labels.highlights }),
    ).toBeVisible();
    await expect(card.locator(".highlights li")).toHaveText(work.highlights);
    await expect(
      card.getByRole("list", { name: work.labels.tech }).getByRole("listitem"),
    ).toHaveText(work.tech);
  }
});

test("Profile は職務要約の後に、資格・活動・外部リンクをデータの順で並べる", async ({
  page,
}) => {
  const content = profile();
  const section = page.locator("#profile");
  await expect(section.locator(".summary")).toHaveText(
    readBody("profile/index.md"),
  );

  // Only the blocks that have entries are shown, in this order.
  const blocks = [
    {
      label: content.qualificationsLabel,
      count: content.qualifications.length,
    },
    { label: content.activitiesLabel, count: content.activities.length },
    { label: content.linksLabel, count: content.links.length },
  ].filter(({ count }) => count > 0);
  await expect(section.getByRole("heading", { level: 3 })).toHaveText(
    blocks.map(({ label }) => label),
  );

  const block = (label: string) =>
    section.locator(".blocks > div").filter({
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
    await expect(links.nth(index)).toHaveAttribute("href", href);
    if (href.startsWith("https://")) {
      await expectExternalLink(links.nth(index), label);
    } else {
      await expect(links.nth(index)).toHaveAccessibleName(label);
    }
  }
});

test("Skills はカテゴリごとに、見出しと技術をデータの順で並べる", async ({
  page,
}) => {
  const groups = page.locator("#skills .group");
  const expected = skills();
  await expect(groups).toHaveCount(expected.length);
  for (const [index, { group, items }] of expected.entries()) {
    await expect(
      groups.nth(index).getByRole("heading", { level: 3 }),
    ).toHaveText(group);
    await expect(groups.nth(index).getByRole("listitem")).toHaveText(items);
  }
});

test("フッターにはプライバシーポリシーへのリンクだけがあり、ページは / と /privacy/ だけ", async ({
  page,
}) => {
  const links = page.getByRole("contentinfo").getByRole("link");
  await expect(links).toHaveCount(1);
  await expect(links).toHaveAttribute("href", "/privacy/");
  expect(listBuiltPages()).toEqual(["/", "/privacy/"]);
});

test("職務要約の段落の間には余白がある", async ({ page }) => {
  const paragraphs = page.locator("#profile .summary p");
  expect(await paragraphs.count()).toBeGreaterThan(1);
  const gaps = await paragraphs.evaluateAll((list) =>
    list
      .slice(1)
      .map(
        (p, i) =>
          p.getBoundingClientRect().top -
          list[i].getBoundingClientRect().bottom,
      ),
  );
  // Allow sub-pixel rounding in the layout.
  for (const gap of gaps)
    expect(gap).toBeGreaterThanOrEqual(MIN_PARAGRAPH_GAP - 0.5);
});

test("プライバシーポリシーの本文は、ブロックの間に余白があり、見出しの前はさらに空く", async ({
  page,
}) => {
  await page.goto("/privacy/");
  const gaps = await page.locator(".legal .body > *").evaluateAll((list) =>
    list.slice(1).map((el, i) => ({
      tag: el.tagName,
      gap:
        el.getBoundingClientRect().top - list[i].getBoundingClientRect().bottom,
    })),
  );
  expect(gaps.length).toBeGreaterThan(0);
  for (const { tag, gap } of gaps) {
    expect(gap, tag).toBeGreaterThanOrEqual(
      (tag === "H2" ? MIN_HEADING_GAP : MIN_PARAGRAPH_GAP) - 0.5,
    );
  }
});
