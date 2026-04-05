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
type TwCompiler = Awaited<ReturnType<typeof compile>>;
export const _cache: Map<string, TwCompiler> = new Map();

/**
 * Simple djb2 hash for cache key differentiation.
 * O(n) string hash -- no crypto overhead.
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

async function getCompiler(cssInput: string) {
  const key = simpleHash(cssInput);
  let compiler = _cache.get(key);
  if (!compiler) {
    compiler = await compile(cssInput, { loadStylesheet });
    _cache.set(key, compiler);
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

  // Utilities layer: @layer utilities { ... } at end of output
  const utilMatch = output.match(/@layer utilities \{([\s\S]*)\}\s*$/);
  const utilityCss = utilMatch ? utilMatch[1].trim() : "";

  return { themeCss, utilityCss };
}

// --- Unmatched detection [ENG-01] ---
function detectMatches(
  candidates: string[],
  utilityCss: string,
): { matched: Set<string>; unmatched: string[] } {
  const selectorRe = /^\s*\.([^\s{]+)\s*\{/gm;
  const generated = new Set<string>();
  let m;
  while ((m = selectorRe.exec(utilityCss)) !== null) {
    // Unescape CSS backslashes to get original class name
    generated.add(m[1].replace(/\\/g, ""));
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
