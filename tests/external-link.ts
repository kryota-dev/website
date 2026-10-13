import { expect, type Locator } from "@playwright/test";
import {
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
  NEW_TAB_NOTE,
} from "../src/lib/external-link";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A link that leaves the site: it opens in a new tab, says so to assistive
 * technology, and shows the ↗ marker from base.css, which stays out of the
 * link's name.
 */
export async function expectExternalLink(link: Locator, label: string) {
  await expect(link).toHaveAttribute("target", EXTERNAL_LINK_TARGET);
  const rel = ((await link.getAttribute("rel")) ?? "").split(/\s+/);
  expect(rel).toEqual(expect.arrayContaining([...EXTERNAL_LINK_REL]));
  // The visually hidden note is absolutely positioned, so the accessible name
  // computation may put a space before it.
  await expect(link).toHaveAccessibleName(
    new RegExp(`^${escapeRegExp(label)}\\s?${escapeRegExp(NEW_TAB_NOTE)}$`),
  );

  const note = link.locator(".visually-hidden");
  await expect(note).toHaveText(NEW_TAB_NOTE);
  const box = await note.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(1);
  expect(box?.height).toBeLessThanOrEqual(1);

  const marker = await link.evaluate((el) => {
    const style = getComputedStyle(el, "::after");
    return {
      content: style.content,
      display: style.display,
      visibility: style.visibility,
    };
  });
  expect(marker.content).toContain("↗");
  expect(marker.display).not.toBe("none");
  expect(marker.visibility).toBe("visible");
}
