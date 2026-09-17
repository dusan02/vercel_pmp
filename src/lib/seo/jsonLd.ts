/**
 * Serialize a schema.org object for <script type="application/ld+json"> —
 * escapes `<` so embedded markup can't break out of the script tag.
 */
export function toJsonLd(schema: object): string {
  return JSON.stringify(schema).replace(/</g, '\\u003c');
}
