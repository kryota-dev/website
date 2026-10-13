import { expect, test } from "@playwright/test";
import {
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
  NEW_TAB_NOTE,
  isExternalHref,
} from "../src/lib/external-link";
import { listBuiltPages } from "./pages";

for (const path of listBuiltPages()) {
  test(`${path} の外部リンクだけが新しいタブで開き、そう伝える`, async ({
    page,
  }) => {
    await page.goto(path);
    const links = await page.locator("a[href]").evaluateAll((list) =>
      list.map((a) => ({
        href: a.getAttribute("href") ?? "",
        target: a.getAttribute("target"),
        rel: (a.getAttribute("rel") ?? "").split(/\s+/).filter(Boolean),
        note: a.querySelector(".visually-hidden")?.textContent ?? null,
      })),
    );
    expect(links.some(({ href }) => isExternalHref(href))).toBe(true);
    for (const { href, target, rel, note } of links) {
      if (isExternalHref(href)) {
        expect(target, href).toBe(EXTERNAL_LINK_TARGET);
        expect(rel, href).toEqual(
          expect.arrayContaining([...EXTERNAL_LINK_REL]),
        );
        expect(note, href).toBe(NEW_TAB_NOTE);
      } else {
        // Internal and mailto: links keep opening in the same tab.
        expect(target, href).toBeNull();
        expect(note, href).toBeNull();
      }
    }
  });
}
