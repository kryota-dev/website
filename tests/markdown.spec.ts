import { createSatteriMarkdownProcessor } from "@astrojs/markdown-satteri";
import { expect, test } from "@playwright/test";
import { NEW_TAB_NOTE, externalLinkAttributes } from "../src/lib/external-link";
import { markdownProcessorOptions } from "../src/lib/markdown";

/** Renders Markdown with the site's options and Astro's own plugins. */
async function render(markdown: string) {
  const renderer = await createSatteriMarkdownProcessor(
    markdownProcessorOptions,
  );
  const { code, metadata } = await renderer.render(markdown);
  return { html: code, headings: metadata.headings };
}

const NOTE = `<span class="visually-hidden">${NEW_TAB_NOTE}</span>`;

test.describe("Markdown の外部リンク", () => {
  test("https: のリンクは新しいタブで開き、そう伝える", async () => {
    const { html } = await render("[Docs](https://example.com/)");
    expect(html).toContain(
      `<a href="https://example.com/" target="_blank" rel="noopener noreferrer">Docs${NOTE}</a>`,
    );
  });

  for (const href of ["/about/", "#top", "mailto:a@example.com"]) {
    test(`${href} は同じタブで開き、注記を付けない`, async () => {
      const { html } = await render(`[link](${href})`);
      expect(html).toContain(`<a href="${href}">link</a>`);
    });
  }

  test("HTML で書いたリンクも扱い、もとの rel を残す", async () => {
    const { html } = await render(
      '<a href="https://example.com/" rel="me">Me</a>',
    );
    expect(html).toMatch(/<a [^>]*target="_blank"[^>]*>Me<span/);
    const rel = html.match(/rel="([^"]*)"/)?.[1].split(" ");
    expect(rel).toEqual(
      expect.arrayContaining(["me", "noopener", "noreferrer"]),
    );
  });

  test("見出しの ID には注記を含めない", async () => {
    const { html, headings } = await render(
      "## See [Docs](https://example.com/)\n\n## See Docs",
    );
    expect(headings.map(({ slug }) => slug)).toEqual([
      "see-docs",
      "see-docs-1",
    ]);
    expect(html).toContain('<h2 id="see-docs">');
  });
});

test.describe("テンプレートのリンクの属性", () => {
  test("https: のリンクには target と rel を付ける", () => {
    expect(externalLinkAttributes("https://example.com/")).toEqual({
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  for (const href of ["/about/", "#top", "mailto:a@example.com"]) {
    test(`${href} には何も付けない`, () => {
      expect(externalLinkAttributes(href)).toEqual({});
    });
  }
});
