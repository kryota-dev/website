import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const CONTENT_DIR = "src/content";
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

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

/** Reads a content file's Markdown body (everything after the frontmatter). */
export function readBody(file: string): string {
  const source = readFileSync(join(CONTENT_DIR, file), "utf8");
  return source.replace(FRONTMATTER, "").trim();
}

/**
 * Reads every entry of an ordered collection, sorted by `order`. The id is the
 * file path without `.md`, as the glob loader derives it for these
 * lowercase, single-level file names.
 */
function readOrdered<T extends { order: number }>(
  collection: string,
): (T & { id: string; body: string })[] {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((file) => file.endsWith(".md"))
    .map((file) => ({
      id: file.replace(/\.md$/, ""),
      body: readBody(join(collection, file)),
      ...readFrontmatter<T>(join(collection, file)),
    }))
    .sort((a, b) => a.order - b.order);
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
    person: {
      name: string;
      alternateName: string;
      jobTitle: string;
      addressRegion: string;
      addressCountry: string;
    };
  };
}

export interface SectionContent {
  id: string;
  order: number;
  navLabel: string;
  icon: string;
  heading: string;
}

export const site = () => readFrontmatter<SiteContent>("site/index.md");

export const sections = () => readOrdered<SectionContent>("sections");

export interface SkillGroupContent {
  order: number;
  group: string;
  items: string[];
}

export const skills = () => readOrdered<SkillGroupContent>("skills");

/** Inline Markdown links (`[label](href)`) in a body, in order. */
export function markdownLinks(body: string): { label: string; href: string }[] {
  return [...body.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)].map(
    ([, label, href]) => ({ label, href }),
  );
}

export interface ProfileContent {
  qualificationsLabel: string;
  qualifications: { date: string; name: string; note?: string }[];
  activitiesLabel: string;
  activities: { period: string; title: string; detail?: string }[];
  linksLabel: string;
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
export const works = () => readOrdered<WorkContent>("works");
