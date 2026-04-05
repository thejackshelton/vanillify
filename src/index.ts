import { parse } from "./pipeline/parser";
import { extract } from "./pipeline/extractor";
import { assignNames } from "./pipeline/namer";
import { rewrite } from "./pipeline/rewriter";
import { resolveCustomVariants } from "./variants/resolver";
import type { ConvertOptions, ConvertResult } from "./types";

/**
 * Convert a JSX/TSX source file from Tailwind classes to vanilla CSS.
 *
 * Accepts source code as a string, extracts Tailwind class names from
 * className/class attributes using AST parsing (not regex), generates
 * vanilla CSS using UnoCSS's createGenerator with preset-wind4, and
 * returns the transformed component with indexed class names (.node0, .node1)
 * plus the generated CSS.
 *
 * This is a pure async function with no file I/O.
 *
 * @param source - JSX/TSX source code string
 * @param filename - Filename for parser language detection (e.g., "component.tsx")
 * @param options - Optional configuration (reserved for Phase 2 customVariants)
 * @returns Promise<ConvertResult> with { component, css, warnings }
 */
export async function convert(
  source: string,
  filename: string,
  options?: ConvertOptions,
): Promise<ConvertResult> {
  // 1. Parse source to AST
  const { program } = parse(filename, source);

  // 2. Extract class entries from AST
  const { entries, warnings: extractWarnings } = extract(program, source);

  // 3. Assign indexed class names
  const nameMap = assignNames(entries);

  // 4. Resolve custom variants if provided
  const variantObjects = options?.customVariants
    ? resolveCustomVariants(options.customVariants)
    : undefined;

  // 5. Rewrite source and generate per-node CSS
  const result = await rewrite(source, entries, nameMap, extractWarnings, variantObjects);

  return result;
}

export type { ConvertOptions, ConvertResult, Warning, NodeEntry } from "./types";
