import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const CONTENT_DIR = "src/content";
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Reads a content file's frontmatter so tests follow the Markdown instead of
 * hard-coding copy that the site owner is expected to edit.
 */
export function readFrontmatter<T>(file: string): T {
  const source = readFileSync(join(CONTENT_DIR, file), "utf8");
  const match = source.match(FRONTMATTER);
  if (!match) throw new Error(`${file} has no frontmatter`);
  return parse(match[1]) as T;
}

export interface SiteContent {
  name: string;
  skipLink: string;
  nav: { label: string };
  theme: { legend: string; light: string; dark: string; system: string };
  contactCta: string;
}

export interface SectionContent {
  id: string;
  order: number;
  navLabel: string;
}

export interface AvailabilityContent {
  statusLabel: string;
  status: string;
}

export interface ContactContent {
  fields: { id: string; label: string; required?: boolean }[];
  submit: string;
  unavailable: string;
}

export const site = () => readFrontmatter<SiteContent>("site/index.md");

export const availability = () =>
  readFrontmatter<AvailabilityContent>("availability/index.md");

export const contact = () =>
  readFrontmatter<ContactContent>("contact/index.md");

export function sections(): SectionContent[] {
  return readdirSync(join(CONTENT_DIR, "sections"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => readFrontmatter<SectionContent>(join("sections", file)))
    .sort((a, b) => a.order - b.order);
}
