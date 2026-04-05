import { compile } from "tailwindcss";
import type { Warning } from "../types";

// --- Virtual stylesheet resolution ---
// Read CSS content once at module load (not per-call) [ENG-02]
import { createRequire } from "module";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";

const _require = createRequire(import.meta.url);
const twDir = dirname(_require.resolve("tailwindcss/package.json"));
const tailwindIndexCss = readFileSync(resolve(twDir, "index.css"), "utf-8");

async function loadStylesheet(id: string, base: string) {
  if (id === "tailwindcss") {
    return {
      path: "virtual:tailwindcss/index.css",
      base,
      content: tailwindIndexCss,
    };
  }
  // T-09-03: bounded error message, no filesystem path leak
  throw new Error(`Vanillify: cannot resolve stylesheet "${id}"`);
}

// --- Compiler cache [ENG-04] ---
// Cache by full CSS input string (no hash — avoids collision risk)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- internal cache exposed for test inspection only
export const _cache: Map<string, any> = new Map();

/**
 * Get a fresh compiler for the given CSS input, with caching.
 * IMPORTANT: Tailwind's build() is cumulative on a compiler instance —
 * candidates from prior build() calls persist. We cache the *compiled*
 * state but must account for cumulative behavior in detectMatches().
 */
async function getCompiler(cssInput: string) {
  let compiler = _cache.get(cssInput);
  if (!compiler) {
    compiler = await compile(cssInput, { loadStylesheet });
    _cache.set(cssInput, compiler);
  }
  return compiler;
}

// --- Layer extraction [ENG-05] ---
function extractLayers(output: string): {
  themeCss: string;
  utilityCss: string;
} {
  // Theme layer: @layer theme { :root, :host { ... } }
  const themeMatch = output.match(/@layer theme \{([\s\S]*?)\}\s*(?=@layer)/);
  const themeCss = themeMatch ? themeMatch[1].trim() : "";

  // Utilities layer: extract content between @layer utilities { and its matching close brace.
  // Cannot use greedy .* because trailing @property/@layer properties blocks may follow.
  // Use brace-counting to find the matching close brace.
  const utilStart = output.indexOf("@layer utilities {");
  let utilityCss = "";
  if (utilStart !== -1) {
    const contentStart = utilStart + "@layer utilities {".length;
    let depth = 1;
    let i = contentStart;
    while (i < output.length && depth > 0) {
      if (output[i] === "{") depth++;
      else if (output[i] === "}") depth--;
      i++;
    }
    // i now points past the matching }, content is between contentStart and i-1
    utilityCss = output.slice(contentStart, i - 1).trim();
  }

  return { themeCss, utilityCss };
}

// --- Unmatched detection [ENG-01] ---

/**
 * Unescape a CSS selector identifier back to its original class name.
 * Handles:
 * - `\\:` → `:` (escaped colons for variants like hover\:bg-blue)
 * - `\\/` → `/` (escaped slashes for fractions like w-1\/2)
 * - `\\32 xl` → `2xl` (numeric escapes: `\XX ` where XX is hex code point + mandatory space)
 * - `\\.` → `.` (escaped dots for arbitrary values)
 * - Generic `\\X` → `X`
 */
function unescapeCssSelector(escaped: string): string {
  return escaped.replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_, hex, ch) => {
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return ch;
  });
}

function detectMatches(
  candidates: string[],
  utilityCss: string,
): { matched: Set<string>; unmatched: string[] } {
  // Match CSS selectors — capture everything after the leading dot up to the opening brace,
  // including spaces that are part of numeric escapes (e.g. `.\32 xl\:grid`)
  const selectorRe = /^\s*\.((?:[^{](?!,\s*\.))*?)\s*(?:,|\{)/gm;
  const generated = new Set<string>();
  let m;
  while ((m = selectorRe.exec(utilityCss)) !== null) {
    generated.add(unescapeCssSelector(m[1].trimEnd()));
  }

  const matched = new Set<string>();
  const unmatched: string[] = [];
  for (const c of candidates) {
    if (generated.has(c)) matched.add(c);
    else unmatched.push(c);
  }
  return { matched, unmatched };
}

// --- Public API ---
export interface TwGenerateCSSResult {
  /** Raw CSS for all matched tokens (without @layer wrappers) */
  css: string;
  /** :root CSS variable definitions from theme layer */
  themeCss: string;
  /** Tokens that successfully generated CSS */
  matched: Set<string>;
  /** Tokens that produced no CSS (coverage gaps) */
  unmatched: string[];
  /** Warnings for unmatched tokens */
  warnings: Warning[];
}

/**
 * Generate CSS from a set of Tailwind class tokens using Tailwind's
 * native compile().build() API.
 *
 * @param tokens - Set of Tailwind class tokens to generate CSS for
 * @param customVariantsCss - Optional CSS string with @custom-variant directives
 * @param themeCss - Optional CSS string with @theme block
 * @returns TwGenerateCSSResult with CSS string, theme CSS, and match info
 */
export async function twGenerateCSS(
  tokens: Set<string>,
  customVariantsCss?: string,
  themeCss?: string,
): Promise<TwGenerateCSSResult> {
  // Early return for empty token set
  if (tokens.size === 0) {
    return {
      css: "",
      themeCss: "",
      matched: new Set<string>(),
      unmatched: [],
      warnings: [],
    };
  }

  // Build CSS input [ENG-03: source(none) prevents file scanning]
  const parts: string[] = ['@import "tailwindcss" source(none);'];
  if (themeCss) parts.push(themeCss);
  if (customVariantsCss) parts.push(customVariantsCss);
  const cssInput = parts.join("\n");

  // Get cached compiler [ENG-04]
  const compiler = await getCompiler(cssInput);
  const candidates = [...tokens];
  const output = compiler.build(candidates);

  // Extract layers [ENG-05]
  const { themeCss: extractedTheme, utilityCss } = extractLayers(output);

  // Detect unmatched [ENG-01]
  const { matched, unmatched } = detectMatches(candidates, utilityCss);

  const warnings: Warning[] = unmatched.map((token) => ({
    type: "unmatched-class" as const,
    message: `Unmatched Tailwind class: "${token}" -- no CSS generated`,
    location: { line: 0, column: 0 },
  }));

  return {
    css: utilityCss,
    themeCss: extractedTheme,
    matched,
    unmatched,
    warnings,
  };
}

/**
 * Reset the Tailwind generator cache (for testing only).
 */
export function resetTwGenerator(): void {
  _cache.clear();
}
