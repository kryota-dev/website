// @ts-check
// Reads a Workers Static Assets _headers file: an unindented URL pattern,
// then indented "Name: value" lines. Lines starting with # are comments.

/**
 * @typedef {{ pattern: string, headers: [name: string, value: string][] }} HeaderRule
 */

/**
 * Header names are lower-cased so that lookups ignore case.
 * @param {string} text contents of _headers
 * @returns {HeaderRule[]}
 */
export function parseHeaderRules(text) {
  /** @type {HeaderRule[]} */
  const rules = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      rules.push({ pattern: line.trim(), headers: [] });
      continue;
    }
    const rule = rules.at(-1);
    const separator = line.indexOf(":");
    if (!rule || separator === -1) throw new Error(`Unexpected line: ${line}`);
    rule.headers.push([
      line.slice(0, separator).trim().toLowerCase(),
      line.slice(separator + 1).trim(),
    ]);
  }
  return rules;
}

/**
 * Every value of a header across the rules with the given pattern.
 * @param {HeaderRule[]} rules
 * @param {string} pattern
 * @param {string} name
 * @returns {string[]}
 */
export function headerValues(rules, pattern, name) {
  return rules
    .filter((rule) => rule.pattern === pattern)
    .flatMap((rule) => rule.headers)
    .filter(([header]) => header === name.toLowerCase())
    .map(([, value]) => value);
}
