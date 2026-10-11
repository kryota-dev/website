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
  description: string;
  skipLink: string;
  nav: { label: string };
  theme: { legend: string; light: string; dark: string; system: string };
  seo: {
    locale: string;
    ogImageAlt: string;
    person: { name: string; jobTitle: string };
    organization: {
      name: string;
      description: string;
      addressRegion: string;
      addressCountry: string;
    };
  };
}

export interface SectionContent {
  id: string;
  order: number;
  navLabel: string;
}

export const site = () => readFrontmatter<SiteContent>("site/index.md");

export function sections(): SectionContent[] {
  return readdirSync(join(CONTENT_DIR, "sections"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => readFrontmatter<SectionContent>(join("sections", file)))
    .sort((a, b) => a.order - b.order);
}

export interface ProfileContent {
  links: { label: string; href: string }[];
}

export interface LegalContent {
  title: string;
  description: string;
}

export const profile = () =>
  readFrontmatter<ProfileContent>("profile/index.md");

export const legal = (id: "privacy") =>
  readFrontmatter<LegalContent>(`legal/${id}.md`);

export interface WorkContent {
  order: number;
  industry: string;
  period: string;
  title: string;
  role: string;
  highlights: string[];
  tech: string[];
  labels: { role: string; highlights: string; tech: string };
}

/** Works in display order (`order` ascending: the most recent first). */
export function works(): (WorkContent & { id: string })[] {
  return readdirSync(join(CONTENT_DIR, "works"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => ({
      id: file.replace(/\.md$/, ""),
      ...readFrontmatter<WorkContent>(join("works", file)),
    }))
    .sort((a, b) => a.order - b.order);
}
