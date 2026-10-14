import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const markdown = (dir: string) =>
  glob({ base: `./src/content/${dir}`, pattern: "**/*.md" });

const text = z.string().min(1);

const ALLOWED_LINK_PROTOCOLS = new Set(["https:", "mailto:"]);

const href = z
  .url()
  .refine((value) => ALLOWED_LINK_PROTOCOLS.has(new URL(value).protocol), {
    message: "href must use https: or mailto:",
  });

const link = z.object({ label: text, href });

const site = defineCollection({
  loader: markdown("site"),
  schema: z.object({
    name: text,
    description: text,
    skipLink: text,
    nav: z.object({ label: text }),
    theme: z.object({
      legend: text,
      light: text,
      dark: text,
      system: text,
    }),
    footer: z.object({ navLabel: text, copyright: text }),
    seo: z.object({
      locale: z.string().regex(/^[a-z]{2}_[A-Z]{2}$/),
      ogImageAlt: text,
      person: z.object({
        name: text,
        alternateName: text,
        jobTitle: text,
        // Prefecture only; no street address.
        addressRegion: text,
        addressCountry: z.string().regex(/^[A-Z]{2}$/),
      }),
    }),
  }),
});

const hero = defineCollection({
  loader: markdown("hero"),
  schema: z.object({
    // Shown under the name as one sentence. The name and role come from
    // site.seo.person, so they match the structured data.
    tagline: text.refine((value) => !value.includes("\n"), {
      message: "tagline must be one line",
    }),
  }),
});

const sectionId = z.enum(["works", "skills", "profile", "contact"]);

const sections = defineCollection({
  loader: markdown("sections"),
  schema: z.object({
    id: sectionId,
    order: z.number().int(),
    navLabel: text,
    // One emoji shown before the heading; hidden from assistive technology,
    // so it must not carry text.
    icon: z.string().regex(/^\p{RGI_Emoji}$/v, "icon must be one emoji"),
    label: text,
    heading: text,
  }),
});

const works = defineCollection({
  loader: markdown("works"),
  schema: z.object({
    order: z.number().int(),
    industry: text,
    period: text,
    title: text,
    role: text,
    highlights: z.array(text).min(1),
    tech: z.array(text).min(1),
    labels: z.object({ role: text, highlights: text, tech: text }),
  }),
});

const skills = defineCollection({
  loader: markdown("skills"),
  schema: z.object({
    order: z.number().int(),
    group: text,
    items: z.array(text).min(1),
  }),
});

const profile = defineCollection({
  loader: markdown("profile"),
  schema: z.object({
    qualificationsLabel: text,
    // Newest first; a lapsed certification keeps its note (e.g. the expiry).
    qualifications: z.array(
      z.object({ date: text, name: text, note: text.optional() }),
    ),
    activitiesLabel: text,
    // Newest first.
    activities: z.array(
      z.object({ period: text, title: text, detail: text.optional() }),
    ),
    linksLabel: text,
    links: z.array(link),
  }),
});

const legal = defineCollection({
  loader: markdown("legal"),
  schema: z.object({
    title: text,
    description: text,
  }),
});

export const collections = {
  site,
  hero,
  sections,
  works,
  skills,
  profile,
  legal,
};
