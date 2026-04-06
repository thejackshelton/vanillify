import { parse } from "./pipeline/parser";
import { extract, findTwMergeNames } from "./pipeline/extractor";
import { assignNames } from "./pipeline/namer";
import { rewrite } from "./pipeline/rewriter";
import type { ConvertOptions, ConvertResult } from "./types";

/**
 * Convert a JSX/TSX source file from Tailwind classes to vanilla CSS.
 *
 * Accepts source code as a string, extracts Tailwind class names from
 * className/class attributes using AST parsing (not regex), generates
 * vanilla CSS using Tailwind's native compile().build() API, and
 * returns the transformed component with indexed class names (.node0, .node1)
 * plus the generated CSS.
 *
 * This is a pure async function with no file I/O.
 *
 * @param source - JSX/TSX source code string
 * @param filename - Filename for parser language detection (e.g., "component.tsx")
 * @param options - Optional configuration (css, outputFormat)
 * @returns Promise<ConvertResult> with { component, css, warnings }
 */
export async function convert(
  source: string,
  filename: string,
  options?: ConvertOptions,
): Promise<ConvertResult> {
  // 1. Parse source to AST
  const { program } = parse(filename, source);

  // 2. Scan for twMerge local names (Phase 3: TMR-01 through TMR-04)
  const twMergeNames = findTwMergeNames(program);

  // 3. Extract class entries from AST (pass twMergeNames for twMerge-aware extraction)
  const { entries, warnings: extractWarnings, unresolvableContainers } = extract(program, source, twMergeNames);

  // 4. Assign indexed class names
  const nameMap = assignNames(entries);

  // 5. Rewrite source and generate per-node CSS via Tailwind engine
  // Pass raw CSS string directly — Tailwind handles @theme and @custom-variant natively
  // Pass twMergeNames for post-rewrite import removal (Task 2 / TMR-03)
  const result = await rewrite(
    source, entries, nameMap, extractWarnings,
    options?.css, options?.outputFormat, filename, unresolvableContainers, twMergeNames,
  );

  return {
    component: result.component,
    css: result.css,
    themeCss: options?.css ? (result.themeCss ?? "") : "",
    warnings: result.warnings,
    ...(result.classMap ? { classMap: result.classMap } : {}),
  };
}

export type { ConvertOptions, ConvertResult, OutputFormat, Warning, NodeEntry } from "./types";
