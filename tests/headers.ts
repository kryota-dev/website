import { readFileSync } from "node:fs";
import {
  headerValues,
  parseHeaderRules,
  type HeaderRule,
} from "../scripts/headers-file.mjs";

export { headerValues };

const HEADERS_FILE = "dist/client/_headers";

export function readHeaderRules(file = HEADERS_FILE): HeaderRule[] {
  return parseHeaderRules(readFileSync(file, "utf8"));
}

/** The single Content-Security-Policy served on every path. */
export function readCsp(rules = readHeaderRules()): string {
  const values = headerValues(rules, "/*", "content-security-policy");
  if (values.length !== 1) {
    throw new Error(`Expected one CSP for /*, found ${values.length}`);
  }
  return values[0];
}

/** The hashes listed in one directive of a CSP, e.g. "script-src". */
export function directiveHashes(csp: string, directive: string): string[] {
  const entry = csp
    .split(";")
    .map((part) => part.trim().split(/\s+/))
    .find(([name]) => name === directive);
  if (!entry) throw new Error(`${directive} is missing from the CSP`);
  return entry.filter((source) => source.startsWith("'sha256-")).sort();
}
