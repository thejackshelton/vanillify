import type { Warning } from "../types";
import type { ParseThemeResult, ThemeDeclaration } from "./types";

/**
 * Parse `@theme { ... }` CSS blocks into an array of CSS variable declarations.
 *
 * Handles:
 * - Full `@theme { ... }` wrapper or bare declarations
 * - CSS comments (`/* ... *​/`)
 * - Duplicate properties (last-wins per CSS cascade)
 * - Malformed lines (warned and skipped)
 * - `initial` values (unsupported @theme reset, warned and skipped)
 *
 * @param themeCss - CSS string containing theme declarations
 * @returns Parsed declarations and any warnings
 */
export function parseThemeCss(themeCss: string): ParseThemeResult {
  const trimmed = themeCss.trim();
  if (!trimmed) {
    return { declarations: [], warnings: [] };
  }

  const warnings: Warning[] = [];

  // Strip CSS comments first so they don't interfere with block extraction
  const stripped = trimmed.replace(/\/\*[\s\S]*?\*\//g, "");

  // Extract content from all @theme { ... } blocks, or use as bare declarations
  let content: string;
  const themeBlocks = [...stripped.matchAll(/@theme\s*\{([^}]*)\}/g)];
  if (themeBlocks.length > 0) {
    content = themeBlocks.map((m) => m[1]).join("\n");
  } else {
    content = stripped;
  }

  // Split on semicolons and process each segment
  const segments = content.split(";");
  const declarationMap = new Map<string, ThemeDeclaration>();

  for (const segment of segments) {
    const line = segment.trim();
    if (!line) continue;

    // T-06-01: Only declarations starting with -- are valid
    if (!line.startsWith("--")) {
      warnings.push({
        type: "theme-parse-error",
        message: `Malformed theme declaration: "${line}"`,
        location: { line: 0, column: 0 },
      });
      continue;
    }

    // Split on first colon for property/value
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      warnings.push({
        type: "theme-parse-error",
        message: `Missing value in theme declaration: "${line}"`,
        location: { line: 0, column: 0 },
      });
      continue;
    }

    const property = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    // Handle @theme reset (initial value)
    if (value === "initial") {
      warnings.push({
        type: "unsupported-theme-reset",
        message: `Unsupported @theme reset for "${property}": initial values are not supported`,
        location: { line: 0, column: 0 },
      });
      continue;
    }

    // Last-wins: Map overwrites previous entries for the same property
    declarationMap.set(property, { property, value });
  }

  return {
    declarations: Array.from(declarationMap.values()),
    warnings,
  };
}
