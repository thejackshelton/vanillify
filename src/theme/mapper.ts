// CONFORMANCE TABLE (preset-wind4@66.6.7)
// Status: direct = tested direct mapping, inferred = follows pattern but untested
// --color-*       -> theme.colors.*      [direct]
// --font-*        -> theme.font.*        [direct]
// --font-weight-* -> theme.fontWeight.*  [direct]
// --text-*        -> theme.text.*        [direct, special: { fontSize }]
// --tracking-*    -> theme.tracking.*    [direct]
// --leading-*     -> theme.leading.*     [direct]
// --spacing-*     -> theme.spacing.*     [direct]
// --radius-*      -> theme.radius.*      [direct]
// --shadow-*      -> theme.shadow.*      [direct]
// --inset-shadow-* -> theme.insetShadow.* [inferred]
// --drop-shadow-* -> theme.dropShadow.*  [direct]
// --blur-*        -> theme.blur.*        [direct]
// --ease-*        -> theme.ease.*        [direct]
// --breakpoint-*  -> theme.breakpoint.*  [direct]
// --perspective-* -> theme.perspective.* [inferred]
// --animate-*     -> theme.animation.*   [inferred, complex structure]
// --container-*   -> theme.container.*   [inferred]

import type { Warning } from "../types";
import type { ThemeDeclaration, ThemeMapResult } from "./types";

/**
 * Maps Tailwind v4 CSS variable namespaces to UnoCSS theme keys.
 *
 * Sorted by length descending at runtime so `--font-weight-` matches before `--font-`.
 */
export const NAMESPACE_MAP: Record<string, string> = {
  "--color-": "colors",
  "--font-weight-": "fontWeight",
  "--font-": "font",
  "--text-": "text",
  "--tracking-": "tracking",
  "--leading-": "leading",
  "--spacing-": "spacing",
  "--radius-": "radius",
  "--shadow-": "shadow",
  "--inset-shadow-": "insetShadow",
  "--drop-shadow-": "dropShadow",
  "--blur-": "blur",
  "--ease-": "ease",
  "--breakpoint-": "breakpoint",
  "--perspective-": "perspective",
  "--animate-": "animation",
  "--container-": "container",
};

/**
 * Sorted prefixes by length descending -- ensures longest prefix matches first.
 * CRITICAL: `--font-weight-` must match before `--font-`.
 */
const SORTED_PREFIXES = Object.keys(NAMESPACE_MAP).sort(
  (a, b) => b.length - a.length,
);

/**
 * Bare namespace prefixes (without trailing hyphen) for DEFAULT key matching.
 * e.g., `--spacing` (no suffix) maps to `spacing.DEFAULT`.
 */
const BARE_NAMESPACE_MAP: Record<string, string> = {};
for (const prefix of Object.keys(NAMESPACE_MAP)) {
  // Remove trailing hyphen to get the bare form: "--spacing-" -> "--spacing"
  const bare = prefix.slice(0, -1);
  BARE_NAMESPACE_MAP[bare] = NAMESPACE_MAP[prefix];
}

/**
 * Set a value in a nested object, handling numeric shade suffixes.
 *
 * If `name` ends with a hyphen followed by digits (e.g., "brand-500"),
 * creates a nested object: `obj.brand = { 500: value }`.
 * Otherwise sets `obj[name] = value`.
 */
function setNestedValue(
  obj: Record<string, any>,
  name: string,
  value: any,
): void {
  const numericMatch = name.match(/^(.+)-(\d+)$/);
  if (numericMatch) {
    const [, parent, numKey] = numericMatch;
    if (!obj[parent] || typeof obj[parent] !== "object") {
      obj[parent] = {};
    }
    obj[parent][numKey] = value;
  } else {
    obj[name] = value;
  }
}

/**
 * Convert a CSS custom property name with leading `--` to camelCase.
 * Strips `--` prefix, then converts hyphen-separated segments to camelCase.
 *
 * e.g., "--custom-foo" -> "customFoo"
 */
function toCamelCase(property: string): string {
  const stripped = property.replace(/^--/, "");
  return stripped.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
}

/**
 * Map an array of theme declarations to a UnoCSS theme configuration object.
 *
 * Handles:
 * - All 17 verified Tailwind v4 CSS variable namespaces
 * - Nested color shades (e.g., `--color-brand-500`)
 * - Text fontSize/lineHeight special case
 * - Bare namespace DEFAULT values (e.g., `--spacing` without suffix)
 * - Unknown namespaces: warned but passed through (THEME-07)
 *
 * @param declarations - Array of parsed theme declarations
 * @returns Theme config object and any warnings
 */
export function mapToThemeConfig(
  declarations: ThemeDeclaration[],
): ThemeMapResult {
  const theme: Record<string, any> = {};
  const warnings: Warning[] = [];

  for (const { property, value } of declarations) {
    // Try bare namespace match first (e.g., "--spacing" with no suffix)
    if (BARE_NAMESPACE_MAP[property]) {
      const themeKey = BARE_NAMESPACE_MAP[property];
      if (!theme[themeKey]) theme[themeKey] = {};
      theme[themeKey].DEFAULT = value;
      continue;
    }

    // Try prefix match (longest first)
    let matched = false;
    for (const prefix of SORTED_PREFIXES) {
      if (property.startsWith(prefix)) {
        const themeKey = NAMESPACE_MAP[prefix];
        const name = property.slice(prefix.length);

        if (!theme[themeKey]) theme[themeKey] = {};

        // Special case: --text-*
        if (themeKey === "text") {
          // Check for --text-<name>--line-height
          const lineHeightSuffix = "--line-height";
          if (name.endsWith(lineHeightSuffix)) {
            const baseName = name.slice(
              0,
              name.length - lineHeightSuffix.length,
            );
            if (!theme[themeKey][baseName]) {
              theme[themeKey][baseName] = {};
            }
            theme[themeKey][baseName].lineHeight = value;
          } else {
            if (!theme[themeKey][name]) {
              theme[themeKey][name] = {};
            }
            theme[themeKey][name].fontSize = value;
          }
        } else {
          setNestedValue(theme[themeKey], name, value);
        }

        matched = true;
        break;
      }
    }

    if (!matched) {
      // Unknown namespace: warn but pass through (THEME-07)
      warnings.push({
        type: "unknown-theme-namespace",
        message: `Unknown theme namespace for "${property}": passing through as custom key`,
        location: { line: 0, column: 0 },
      });

      // T-06-04: sanitize through camelCase, never used as code paths
      const key = toCamelCase(property);
      theme[key] = value;
    }
  }

  return { theme, warnings };
}
