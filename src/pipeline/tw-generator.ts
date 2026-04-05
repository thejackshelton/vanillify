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

// --- Compiler creation [ENG-04] ---
// Tailwind's build() is cumulative — candidates from prior calls persist on the
// same compiler instance. This means we CANNOT reuse a compiler across calls with
// different candidate sets, or earlier candidates leak into later CSS output.
// Instead we cache by (cssInput + sorted candidates) to get isolation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- internal cache exposed for test inspection only
export const _cache: Map<string, any> = new Map();

// --- Layer extraction [ENG-05] ---
function extractLayers(output: string): {
  themeCss: string;
  utilityCss: string;
} {
  // Theme layer: @layer theme { :root, :host { ... } }
  const themeMatch = output.match(/@layer theme \{([\s\S]*?)\}\s*(?=@layer)/);
  const themeCss = themeMatch ? themeMatch[1].trim() : "";

  // Utilities layer: Tailwind always emits @layer utilities { ... } as the last @layer block,
  // optionally followed by @property and/or @layer properties blocks on new lines.
  // Rather than parsing CSS braces (which is fragile with escaped chars, quoted values, etc.),
  // we find the boundary by locating the first post-utilities directive and scanning backwards
  // to find the closing } of @layer utilities.
  const utilStart = output.indexOf("@layer utilities {");
  let utilityCss = "";
  if (utilStart !== -1) {
    const contentStart = utilStart + "@layer utilities {".length;

    // Find where post-utilities blocks begin (if any)
    // These always start at column 0 on a new line after @layer utilities closes
    const postUtilPatterns = ["\n@property ", "\n@property\t", "\n@layer properties"];
    let endBoundary = output.length;
    for (const pat of postUtilPatterns) {
      const idx = output.indexOf(pat, contentStart);
      if (idx !== -1 && idx < endBoundary) endBoundary = idx;
    }

    // The closing } of @layer utilities is the last } before the endBoundary
    const slice = output.slice(contentStart, endBoundary);
    const lastBrace = slice.lastIndexOf("}");
    utilityCss = lastBrace !== -1 ? slice.slice(0, lastBrace).trim() : slice.trim();
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
  // Extract class selectors from CSS. Tailwind emits one selector per rule.
  // Selectors may contain escaped chars: \: \[ \] \{ \} \, \/ \. \32 (numeric)
  // Numeric escapes include a mandatory space: \32 xl means char 0x32 ('2') + 'xl'.
  // We capture from the leading dot up to the opening brace, handling escaped
  // characters as single units so escaped commas/braces don't terminate prematurely.
  const selectorRe = /^\s*\.((?:\\[0-9a-fA-F]{1,6}\s?|\\.|[^{,\s])*)\s*(?:,.*?)?\s*\{/gm;
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

  // Fresh compile() per call to avoid cumulative build() state leaking
  // across calls with different candidate sets. compile() is ~4ms which
  // is acceptable for a build-time tool. [ENG-04: cache by cssInput]
  const candidates = [...tokens];
  const cacheKey = cssInput + "\0" + JSON.stringify([...tokens].sort());
  const cached = _cache.get(cacheKey);
  if (cached) {
    // Return a defensive copy so callers can't mutate the cache
    return {
      css: cached.css,
      themeCss: cached.themeCss,
      matched: new Set(cached.matched),
      unmatched: [...cached.unmatched],
      warnings: cached.warnings.map((w: Warning) => ({ ...w, location: { ...w.location } })),
    };
  }

  const compiler = await compile(cssInput, { loadStylesheet });
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

  const result: TwGenerateCSSResult = {
    css: utilityCss,
    themeCss: extractedTheme,
    matched,
    unmatched,
    warnings,
  };
  // Cache a defensive copy to prevent mutation poisoning.
  // Freeze strings (css, themeCss) are immutable. Clone mutable containers.
  _cache.set(cacheKey, {
    css: utilityCss,
    themeCss: extractedTheme,
    matched: new Set(matched),
    unmatched: [...unmatched],
    warnings: warnings.map((w) => ({ ...w, location: { ...w.location } })),
  });
  return result;
}

/**
 * Reset the Tailwind generator cache (for testing only).
 */
export function resetTwGenerator(): void {
  _cache.clear();
}
