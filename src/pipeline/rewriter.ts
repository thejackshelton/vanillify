import { createRegExp, exactly, maybe } from "magic-regexp";
import type { NodeEntry, OutputFormat, Warning } from "../types";
import type { NameMap } from "./namer";
import { twGenerateCSS } from "./generator";
import { offsetToLineColumn } from "./extractor";

/** Matches .ts, .tsx, .js, .jsx file extensions at end of string */
const FILE_EXT_RE = createRegExp(
  exactly(".").and(exactly("ts").or(exactly("js"))).and(maybe(exactly("x"))).at.lineEnd(),
);

export interface RewriteResult {
  /** Source with className values replaced by indexed names */
  component: string;
  /** Generated vanilla CSS with .nodeN selectors */
  css: string;
  /** :root CSS variable definitions from theme layer (empty string if no theme) */
  themeCss: string;
  /** All warnings (from extraction + generation) */
  warnings: Warning[];
  /** CSS Modules class map (only present when outputFormat is 'css-modules') */
  classMap?: Record<string, string>;
}

/**
 * Build the replacement value string for a single NodeEntry.
 *
 * Three cases (checked in priority order):
 * 1. isObjectKey  — object property key position: bare name or [styles.name]
 * 2. isFragment   — expression position inside JSX container: name or styles.name (no braces)
 * 3. static attr  — className="..." position: "name" or {styles.name}
 *
 * CRITICAL: isObjectKey is checked before isFragment because object key entries
 * also have isFragment=true (they are fragments inside a container).
 */
function buildReplacementValue(name: string, isCSSModules: boolean, entry: NodeEntry): string {
  if (entry.isObjectKey) {
    // Shorthand property: { hidden } -> { node0: hidden } or { [styles.node0]: hidden }
    if (entry.shorthandOriginal) {
      return isCSSModules
        ? `[styles.${name}]: ${entry.shorthandOriginal}`
        : `${name}: ${entry.shorthandOriginal}`;
    }
    // Quoted/unquoted key: { "flex gap-4": cond } -> { node0: cond } or { [styles.node0]: cond }
    return isCSSModules ? `[styles.${name}]` : name;
  }
  if (entry.isFragment) {
    // Expression position inside JSX container: "flex" -> styles.node0 or "node0"
    // No curly braces -- the containing expression already provides the JS context
    return isCSSModules ? `styles.${name}` : `"${name}"`;
  }
  // Static JSX string attribute: className="flex p-4" -> className={styles.node0} or className="node0"
  return isCSSModules ? `{styles.${name}}` : `"${name}"`;
}

/**
 * Rewrite the source component and assemble per-node CSS.
 *
 * For each static entry:
 * 1. Generate CSS for that node's tokens via Tailwind's compile().build()
 * 2. Replace Tailwind-generated top-level selectors with .nodeN
 * 3. Merge plain declarations into a single .nodeN {} block
 * 4. Preserve nested content (variants, media queries) as separate .nodeN {} blocks
 * 5. Replace the className value in the source with "nodeN"
 *
 * Dynamic entries are left unchanged in the source.
 * Replacements applied in reverse source order to avoid offset drift.
 *
 * @param source - Original JSX/TSX source string
 * @param entries - NodeEntry[] from extractor
 * @param nameMap - NameMap from namer
 * @param extractWarnings - Warnings from extraction phase
 * @param css - Optional CSS string with @custom-variant and/or @theme directives
 * @param outputFormat - Output format ('vanilla' or 'css-modules')
 * @param filename - Original filename for CSS Modules import path
 * @returns RewriteResult with transformed component, CSS, and all warnings
 */
export async function rewrite(
  source: string,
  entries: NodeEntry[],
  nameMap: NameMap,
  extractWarnings: Warning[],
  css?: string,
  outputFormat?: OutputFormat,
  filename?: string,
  unresolvableContainers?: Map<number, boolean>,
): Promise<RewriteResult> {
  const allWarnings: Warning[] = [...extractWarnings];
  const cssBlocks: string[] = [];
  let resultThemeCss = "";
  let resultSupportCss = "";

  // Track fragment entries that produced zero Tailwind matches (DYN-07: skip replacement)
  const skippedFragments = new Set<number>();

  // Generate CSS per-node to get isolated CSS blocks
  for (const entry of entries) {
    if (entry.isDynamic) continue;
    const name = nameMap.get(entry.nodeIndex);
    if (!name) continue;

    const tokens = new Set(entry.classNames);
    const result = await twGenerateCSS(tokens, css);

    // DYN-07: skip replacement for zero-match fragments (no Tailwind CSS generated)
    if (result.matched.size === 0) {
      if (entry.isFragment && entry.containerStart !== undefined) {
        skippedFragments.add(entry.nodeIndex);
      }
      // Still collect unmatched warnings
      allWarnings.push(...result.warnings);
      continue; // Do not generate CSS or replacement for this entry
    }

    // Collect unmatched warnings
    allWarnings.push(...result.warnings);

    // Collect themeCss and supportCss from the first call that returns non-empty values
    // (these are the same across all nodes since they come from the compiler config)
    if (!resultThemeCss && result.themeCss) {
      resultThemeCss = result.themeCss;
    }
    if (!resultSupportCss && result.supportCss) {
      resultSupportCss = result.supportCss;
    }

    // Rewrite top-level selectors to .nodeN and merge plain declarations
    const nodeCSS = buildNodeCSS(name, result.css);
    if (nodeCSS.trim()) {
      cssBlocks.push(nodeCSS);
    }
  }

  // DYN-08: Per-container warning contract
  // Emit one warning per container that has unresolvable parts AND at least one replaced fragment
  if (unresolvableContainers) {
    // Group fragment entries by containerStart to count totals and replacements
    const containerFragments = new Map<number, { total: number; replaced: number }>();
    for (const entry of entries) {
      if (entry.isFragment && entry.containerStart !== undefined) {
        const stats = containerFragments.get(entry.containerStart) ?? { total: 0, replaced: 0 };
        stats.total++;
        if (!skippedFragments.has(entry.nodeIndex)) {
          stats.replaced++;
        }
        containerFragments.set(entry.containerStart, stats);
      }
    }

    // Emit warning for containers with unresolvable parts that had at least one replacement
    for (const [containerStart, hasUnresolvable] of unresolvableContainers) {
      if (!hasUnresolvable) continue;
      const stats = containerFragments.get(containerStart);
      if (stats && stats.replaced > 0) {
        const loc = offsetToLineColumn(source, containerStart);
        allWarnings.push({
          type: "dynamic-class",
          message: `Partially rewritten className at ${loc.line}:${loc.column} — ${stats.replaced} fragment(s) rewritten, unresolvable expressions remain`,
          location: loc,
        });
      }
    }
  }

  // Rewrite source -- replace className values with indexed names
  // Sort replacements in reverse order to avoid offset drift
  const isCSSModules = outputFormat === 'css-modules';
  const replacements = entries
    .filter((e) => !e.isDynamic && nameMap.has(e.nodeIndex) && !skippedFragments.has(e.nodeIndex))
    .map((e) => {
      const name = nameMap.get(e.nodeIndex)!;
      return {
        span: e.span,
        newValue: buildReplacementValue(name, isCSSModules, e),
      };
    })
    .sort((a, b) => b.span.start - a.span.start);

  let component = source;
  for (const { span, newValue } of replacements) {
    component = component.slice(0, span.start) + newValue + component.slice(span.end);
  }

  // Insert CSS Modules import statement
  if (isCSSModules && filename) {
    component = prependModuleImport(component, filename);
  }

  // Build classMap for CSS Modules
  let classMap: Record<string, string> | undefined;
  if (isCSSModules) {
    classMap = {};
    for (const [, name] of nameMap) {
      classMap[name] = name;
    }
  }

  // Combine: per-node utility CSS blocks + support CSS (hoisted once per file)
  // Support CSS includes @property, @keyframes, @layer properties — needed for
  // animation utilities, content-['x'], space-x-4, etc. to work correctly.
  const parts = [cssBlocks.join("\n\n")];
  if (resultSupportCss) parts.push(resultSupportCss);
  const outputCss = parts.filter(Boolean).join("\n\n");

  return { component, css: outputCss, themeCss: resultThemeCss, warnings: allWarnings, classMap };
}

/**
 * Insert `import styles from './filename.module.css'` into the component source.
 * Placed after the last existing import statement, or at the top if none exist.
 */
function prependModuleImport(source: string, filename: string): string {
  const baseName = filename.replace(FILE_EXT_RE, '');
  const importPath = './' + baseName + '.module.css';
  const importLine = `import styles from '${importPath}';`;

  const lines = source.split('\n');
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith('import ')) {
      lastImportIdx = i;
    }
  }
  if (lastImportIdx >= 0) {
    lines.splice(lastImportIdx + 1, 0, importLine);
  } else {
    lines.unshift(importLine);
  }
  return lines.join('\n');
}

// --- Tailwind CSS block splitting and rewriting ---

/**
 * Split Tailwind's CSS output into top-level blocks.
 *
 * Each top-level block starts with a selector at brace depth 0 and ends
 * when the brace depth returns to 0. Handles nested CSS (variants, media
 * queries inside rules).
 *
 * @param css - Raw utility CSS from twGenerateCSS (no @layer wrappers)
 * @returns Array of complete top-level block strings
 */
function splitTopLevelBlocks(css: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let blockStart = -1;

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];

    if (depth === 0 && blockStart === -1) {
      // Skip whitespace between blocks
      if (ch === '.' || ch === '@') {
        blockStart = i;
      }
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0 && blockStart !== -1) {
        blocks.push(css.slice(blockStart, i + 1).trim());
        blockStart = -1;
      }
    }
  }

  return blocks;
}

/**
 * Replace the top-level selector in a CSS block with a new selector.
 *
 * Given `.hover\:bg-blue-700 { &:hover { ... } }`, replaces
 * `.hover\:bg-blue-700` with `.node0` while preserving inner content.
 *
 * @param block - Complete CSS block string
 * @param newSelector - New selector (e.g., `.node0`)
 * @returns Block with replaced selector
 */
function replaceTopLevelSelector(block: string, newSelector: string): string {
  const firstBrace = block.indexOf('{');
  if (firstBrace === -1) return block;

  return newSelector + ' ' + block.slice(firstBrace);
}

/**
 * Check whether a CSS block contains nested rules (variant selectors,
 * media queries, etc.) inside its outer braces.
 *
 * A "plain" block has only property: value declarations inside.
 * A "nested" block contains additional { } pairs (e.g., &:hover { ... }).
 *
 * @param block - CSS block with selector replaced
 * @returns true if the block contains nested content
 */
function hasNestedContent(block: string): boolean {
  const firstBrace = block.indexOf('{');
  if (firstBrace === -1) return false;

  // Look for another { inside the block (after the first opening brace)
  const inner = block.slice(firstBrace + 1);
  return inner.indexOf('{') !== -1;
}

/**
 * Extract the inner declarations from a plain (non-nested) CSS block.
 *
 * Given `.node0 { display: flex; padding: 1rem; }`, returns:
 * `  display: flex;\n  padding: 1rem;`
 *
 * Strips leading indentation inherited from Tailwind's @layer extraction.
 *
 * @param block - Plain CSS block (no nested content)
 * @returns Formatted declarations with 2-space indent
 */
function extractInnerDeclarations(block: string): string {
  const firstBrace = block.indexOf('{');
  const lastBrace = block.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) return '';

  const inner = block.slice(firstBrace + 1, lastBrace).trim();

  return inner
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => `  ${d};`)
    .join('\n');
}

/**
 * Strip leading indentation from Tailwind's utility CSS output.
 *
 * Tailwind's `extractLayers()` preserves 2-space indentation from the
 * `@layer utilities { ... }` wrapper. Strip it for clean output.
 *
 * @param css - CSS string with potential leading indentation
 * @returns CSS with leading indentation stripped from each line
 */
function stripLeadingIndent(css: string): string {
  // Find the minimum non-zero indentation
  const lines = css.split('\n');
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const indent = line.length - line.trimStart().length;
    if (indent > 0 && indent < minIndent) minIndent = indent;
  }

  if (minIndent === Infinity || minIndent === 0) return css;

  return lines
    .map((line) => {
      if (line.trim().length === 0) return '';
      const currentIndent = line.length - line.trimStart().length;
      if (currentIndent >= minIndent) {
        return line.slice(minIndent);
      }
      return line;
    })
    .join('\n');
}

/**
 * Build CSS for a single node from Tailwind's utility CSS output.
 *
 * Strategy:
 * 1. Strip leading indentation from Tailwind output
 * 2. Split into top-level blocks (one per utility class)
 * 3. Replace each block's selector with .nodeN
 * 4. Merge plain (non-nested) declarations into one .nodeN { ... } block
 * 5. Keep nested blocks (variants, media queries) as separate .nodeN { ... } blocks
 *
 * @param nodeName - Indexed node name (e.g., "node0")
 * @param utilityCss - Raw utility CSS from twGenerateCSS
 * @returns Rewritten CSS with .nodeN selectors
 */
function buildNodeCSS(nodeName: string, utilityCss: string): string {
  if (!utilityCss.trim()) return "";

  const selector = `.${nodeName}`;
  const stripped = stripLeadingIndent(utilityCss);
  const blocks = splitTopLevelBlocks(stripped);

  const plainDeclarations: string[] = [];
  const nestedBlocks: string[] = [];

  for (const block of blocks) {
    const replaced = replaceTopLevelSelector(block, selector);
    if (hasNestedContent(replaced)) {
      nestedBlocks.push(replaced);
    } else {
      // Extract declarations for merging into a single block
      const decls = extractInnerDeclarations(replaced);
      if (decls) {
        plainDeclarations.push(decls);
      }
    }
  }

  const parts: string[] = [];
  if (plainDeclarations.length > 0) {
    parts.push(`${selector} {\n${plainDeclarations.join('\n')}\n}`);
  }
  parts.push(...nestedBlocks);

  return parts.join('\n\n');
}
