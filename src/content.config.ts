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
    contactCta: text,
    footer: z.object({ navLabel: text, copyright: text }),
  }),
});

const hero = defineCollection({
  loader: markdown("hero"),
  schema: z.object({
    byline: text,
    heading: text,
    cta: text,
  }),
});

const sectionId = z.enum(["services", "works", "skills", "profile", "contact"]);

const sections = defineCollection({
  loader: markdown("sections"),
  schema: z.object({
    id: sectionId,
    order: z.number().int(),
    navLabel: text,
    label: text,
    heading: text,
  }),
});

const services = defineCollection({
  loader: markdown("services"),
  schema: z.object({
    order: z.number().int(),
    label: text,
    title: text,
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
    result: text,
    tech: z.array(text).min(1),
    labels: z.object({ role: text, result: text, tech: text }),
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

const availability = defineCollection({
  loader: markdown("availability"),
  schema: z.object({
    statusLabel: text,
    status: text,
    terms: z.array(z.object({ label: text, value: text })).min(1),
  }),
});

const profile = defineCollection({
  loader: markdown("profile"),
  schema: z.object({
    linksLabel: text,
    links: z.array(link),
  }),
});

const fieldBase = {
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  label: text,
  required: z.boolean().default(false),
};

const field = z.discriminatedUnion("type", [
  z.object({
    ...fieldBase,
    type: z.enum(["text", "email"]),
    autocomplete: z.enum(["name", "organization", "email", "tel"]).optional(),
  }),
  z.object({ ...fieldBase, type: z.literal("textarea") }),
  z.object({
    ...fieldBase,
    type: z.literal("select"),
    options: z.array(text).min(1),
  }),
]);

const uniqueFieldIds = z
  .array(field)
  .min(1)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((entry, index) => {
      if (seen.has(entry.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate field id "${entry.id}"`,
          path: [index, "id"],
        });
      }
      seen.add(entry.id);
    });
  });

const contact = defineCollection({
  loader: markdown("contact"),
  schema: z.object({
    formLabel: text,
    required: text,
    optional: text,
    fields: uniqueFieldIds,
    submit: text,
    unavailable: text,
  }),
});

const legal = defineCollection({
  loader: markdown("legal"),
  schema: z.object({
    title: text,
    description: text,
    items: z
      .array(z.object({ label: text, value: text }))
      .min(1)
      .optional(),
  }),
});

export const collections = {
  site,
  hero,
  sections,
  services,
  works,
  skills,
  availability,
  profile,
  contact,
  legal,
};
