import { readFileSync } from "node:fs";

const HEADERS_FILE = "dist/client/_headers";

export interface HeaderRule {
  pattern: string;
  headers: [name: string, value: string][];
}

/**
 * Parses a Workers Static Assets _headers file: an unindented URL pattern,
 * then indented "Name: value" lines. Lines starting with # are comments.
 */
export function readHeaderRules(file = HEADERS_FILE): HeaderRule[] {
  const rules: HeaderRule[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
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

/** Every value of a header across the rules with the given pattern. */
export function headerValues(
  rules: HeaderRule[],
  pattern: string,
  name: string,
): string[] {
  return rules
    .filter((rule) => rule.pattern === pattern)
    .flatMap((rule) => rule.headers)
    .filter(([header]) => header === name.toLowerCase())
    .map(([, value]) => value);
}

/** The single Content-Security-Policy served on every path. */
export function readCsp(rules = readHeaderRules()): string {
  const values = headerValues(rules, "/*", "content-security-policy");
  if (values.length !== 1) {
    throw new Error(`Expected one CSP for /*, found ${values.length}`);
  }
  return values[0];
}
