import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { NEW_TAB_NOTE } from "../src/lib/external-link";
import { expectExternalLink } from "./external-link";
import { listBuiltPages } from "./pages";

/** The acceptance criterion, independent of the implementation's check. */
const isExternal = (href: string) => href.startsWith("https://");

const pages = listBuiltPages();

test("ビルド結果に外部リンクがある", () => {
  const html = pages.map((path) =>
    readFileSync(join("dist/client", path, "index.html"), "utf8"),
  );
  expect(html.some((page) => page.includes('href="https://'))).toBe(true);
});

for (const path of pages) {
  test(`${path} の外部リンクだけが新しいタブで開き、そう伝える`, async ({
    page,
  }) => {
    await page.goto(path);
    const links = page.locator("a[href]");
    for (const link of await links.all()) {
      const href = (await link.getAttribute("href")) ?? "";
      if (isExternal(href)) {
        const text = (await link.textContent()) ?? "";
        await expectExternalLink(link, text.replace(NEW_TAB_NOTE, ""));
      } else {
        // Internal and mailto: links keep opening in the same tab.
        await expect(link, href).not.toHaveAttribute("target");
        await expect(link.locator(".visually-hidden"), href).toHaveCount(0);
      }
    }
  });
}
