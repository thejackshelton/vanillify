import { parse } from "./pipeline/parser";
import { extract } from "./pipeline/extractor";
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
 * @param options - Optional configuration (customVariants, themeCss, outputFormat)
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

  // 4. Convert customVariants to CSS string if Record form
  let customVariantsCss: string | undefined;
  if (options?.customVariants) {
    customVariantsCss = typeof options.customVariants === 'string'
      ? options.customVariants
      : variantsRecordToCss(options.customVariants);
  }

  // 5. Rewrite source and generate per-node CSS via Tailwind engine
  // Pass raw CSS strings directly -- Tailwind handles @theme and @custom-variant natively
  const result = await rewrite(
    source, entries, nameMap, extractWarnings,
    customVariantsCss, options?.themeCss,
    options?.outputFormat, filename,
  );

  return {
    component: result.component,
    css: result.css,
    themeCss: options?.themeCss ? (result.themeCss ?? "") : "",
    warnings: result.warnings,
    ...(result.classMap ? { classMap: result.classMap } : {}),
  };
}

/**
 * Convert a Record<string, string> of custom variant definitions to CSS
 * @custom-variant directives that Tailwind understands natively.
 *
 * @example
 * variantsRecordToCss({ 'ui-checked': '&[ui-checked]' })
 * // => '@custom-variant ui-checked (&[ui-checked]);'
 */
function variantsRecordToCss(record: Record<string, string>): string {
  return Object.entries(record)
    .map(([name, tmpl]) => `@custom-variant ${name} (${tmpl});`)
    .join('\n');
}

export { parseThemeCss } from "./theme/parser";
export { mapToThemeConfig } from "./theme/mapper";
export type { ConvertOptions, ConvertResult, OutputFormat, Warning, NodeEntry } from "./types";
