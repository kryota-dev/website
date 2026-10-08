import {
  getCollection,
  getEntry,
  type CollectionEntry,
  type CollectionKey,
} from "astro:content";

/** Collections that hold exactly one entry, stored as `<collection>/index.md`. */
type SingleCollection =
  "site" | "hero" | "availability" | "profile" | "contact";

export async function getSingle<C extends SingleCollection>(
  collection: C,
): Promise<CollectionEntry<C>> {
  const entry = await getEntry(collection, "index");
  if (!entry) {
    throw new Error(`src/content/${collection}/index.md is missing`);
  }
  return entry as CollectionEntry<C>;
}

type OrderedCollection = Extract<
  CollectionKey,
  "sections" | "services" | "works" | "skills"
>;

export async function getOrdered<C extends OrderedCollection>(
  collection: C,
): Promise<CollectionEntry<C>[]> {
  const entries = (await getCollection(collection)) as CollectionEntry<C>[];
  return entries.toSorted(
    (a, b) =>
      (a.data as { order: number }).order - (b.data as { order: number }).order,
  );
}

/** Sections in display order; each section id must appear in exactly one file. */
export async function getSections(): Promise<CollectionEntry<"sections">[]> {
  const sections = await getOrdered("sections");
  const seen = new Map<string, string>();
  for (const section of sections) {
    const other = seen.get(section.data.id);
    if (other) {
      throw new Error(
        `Section id "${section.data.id}" is used by both ${other} and ${section.id}`,
      );
    }
    seen.set(section.data.id, section.id);
  }
  return sections;
}

export async function getSection(
  id: CollectionEntry<"sections">["data"]["id"],
): Promise<CollectionEntry<"sections">> {
  const section = (await getSections()).find((entry) => entry.data.id === id);
  if (!section) {
    throw new Error(`No file in src/content/sections/ has id "${id}"`);
  }
  return section;
}
