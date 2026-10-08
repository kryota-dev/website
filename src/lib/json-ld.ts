/**
 * Serializes JSON-LD for an inline `<script type="application/ld+json">`.
 * Every "<" is escaped so the text can never close the script element
 * (`</script>`) or open a comment (`<!--`); JSON.parse restores it.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
