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

export async function getSection(
  id: CollectionEntry<"sections">["data"]["id"],
): Promise<CollectionEntry<"sections">> {
  const sections = await getCollection("sections");
  const section = sections.find((entry) => entry.data.id === id);
  if (!section) {
    throw new Error(`src/content/sections/${id}.md is missing`);
  }
  return section;
}
