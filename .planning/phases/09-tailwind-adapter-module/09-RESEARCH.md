# Phase 9: Tailwind Adapter Module - Research

**Researched:** 2026-04-05
**Domain:** Tailwind CSS v4 compile() programmatic API
**Confidence:** HIGH

## Summary

Tailwind CSS v4.2.2 exports an async `compile()` function that accepts a CSS string and options, returning a compiler object with a `build(candidates: string[]): string` method. This is exactly the API vanillify needs to replace UnoCSS's `createGenerator().generate()`. The compile/build pattern maps cleanly onto the existing generator module interface.

Key findings from hands-on testing: (1) `compile()` costs ~4ms and `build()` costs ~1ms for first call, ~0ms for repeated identical calls (internal caching), (2) unmatched classes are silently dropped from output (no error, no CSS generated), (3) `source(none)` works as documented to prevent file scanning, (4) the CSS output is structured in `@layer theme {}` and `@layer utilities {}` blocks that can be reliably parsed, (5) `@theme` and `@custom-variant` directives work natively in the CSS input string.

**Primary recommendation:** Create a new Tailwind adapter in `src/pipeline/tw-generator.ts` (separate from the existing UnoCSS `generator.ts`) that wraps `compile().build()` with a virtual `loadStylesheet` callback. Cache compiler instances by CSS input hash. Extract theme and utility layers from output using string splitting on `@layer` markers.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENG-01 | `convert()` produces CSS using Tailwind v4's `compile().build()` API | `compile()` and `build()` API verified working -- accepts CSS string, returns compiler with `build(candidates[])` method |
| ENG-02 | Tailwind compiler resolves `@import "tailwindcss"` via `loadStylesheet` callback without filesystem | Virtual loadStylesheet verified -- pre-read CSS content at module load, serve from memory map |
| ENG-03 | `source(none)` disables Tailwind file scanning -- candidates from oxc-parser only | Verified: `@import "tailwindcss" source(none)` produces `sources: []` and `root: 'none'` |
| ENG-04 | Compiler instances cached by CSS input hash | `compile()` is ~4ms; `build()` is ~1ms first, ~0ms repeat. Cache compiler by CSS input hash for reuse |
| ENG-05 | CSS output separates utility CSS from `:root` theme variables | Output has distinct `@layer theme { :root, :host { ... } }` and `@layer utilities { ... }` blocks |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tailwindcss` | 4.2.2 (pinned ~4.2.2) | CSS generation via `compile().build()` | Native Tailwind engine = 100% fidelity. `compile()` is the only programmatic API. Pin to patch range per STATE.md decision. [VERIFIED: npm registry -- `npm view tailwindcss version` returns 4.2.2] |

### Supporting

No additional libraries needed. The adapter is a thin wrapper (~50-70 lines) around `compile().build()` with a virtual stylesheet loader.

**Installation:**
```bash
pnpm add tailwindcss@~4.2.2
```

## Architecture Patterns

### Recommended File Structure
```
src/pipeline/
├── tw-generator.ts      # NEW: Tailwind compile() adapter
├── generator.ts          # EXISTING: UnoCSS generator (kept until Phase 11)
├── extractor.ts          # Unchanged
├── namer.ts              # Unchanged
├── parser.ts             # Unchanged
└── rewriter.ts           # Unchanged (adapted in Phase 10)
```

### Pattern 1: Virtual Stylesheet Resolution

**What:** Pre-read Tailwind's CSS files at module import time and serve them from an in-memory map in the `loadStylesheet` callback, eliminating all filesystem I/O during `compile()`.

**When to use:** Always -- vanillify should never touch the filesystem during conversion.

**Implementation detail:** `tailwindcss/index.css` (29KB) is self-contained -- it inlines theme, preflight, and utilities content. When using `@import "tailwindcss" source(none)`, the `loadStylesheet` callback is called exactly once with `id === "tailwindcss"`. No sub-file resolution is needed. [VERIFIED: tested with virtual loadStylesheet]

**Example:**
```typescript
// Source: verified via hands-on testing against tailwindcss@4.2.2
import { compile } from 'tailwindcss';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

// Read CSS content once at module load time
const twDir = dirname(resolve(require.resolve('tailwindcss'), '..'));
const indexCssContent = readFileSync(resolve(twDir, 'index.css'), 'utf-8');

async function loadStylesheet(id: string, base: string) {
  if (id === 'tailwindcss') {
    return { path: 'virtual:tailwindcss/index.css', base, content: indexCssContent };
  }
  throw new Error(`Cannot resolve stylesheet: ${id}`);
}
```

**Important caveat:** The `readFileSync` happens once at module load -- not during `compile()`. This is acceptable because `tailwindcss` is a dependency and its CSS files are guaranteed to exist in node_modules. [VERIFIED: virtual FS approach works correctly]

### Pattern 2: CSS Input Construction

**What:** Build the CSS input string for `compile()` dynamically based on user options (themeCss, customVariants).

**When to use:** Every call to the adapter.

**Example:**
```typescript
// Source: verified via hands-on testing
function buildCssInput(options?: { themeCss?: string; customVariants?: string }): string {
  const parts: string[] = ['@import "tailwindcss" source(none);'];
  
  if (options?.themeCss) {
    // User's @theme block is appended directly -- Tailwind handles it natively
    parts.push(options.themeCss);
  }
  
  if (options?.customVariants) {
    // @custom-variant directives are appended directly
    parts.push(options.customVariants);
  }
  
  return parts.join('\n');
}
```

### Pattern 3: Compiler Instance Caching

**What:** Cache `compile()` results by hashing the CSS input string. The `build()` method can be called repeatedly on the same compiler.

**When to use:** Always -- avoids redundant ~4ms `compile()` calls.

**Example:**
```typescript
// Source: verified via hands-on testing (compile ~4ms, build ~1ms first, ~0ms repeat)
const cache = new Map<string, Awaited<ReturnType<typeof compile>>>();

async function getCompiler(cssInput: string) {
  const key = simpleHash(cssInput);
  let compiler = cache.get(key);
  if (!compiler) {
    compiler = await compile(cssInput, { loadStylesheet });
    cache.set(key, compiler);
  }
  return compiler;
}
```

### Pattern 4: Layer Extraction from Output

**What:** Parse `build()` output to separate `:root` theme variables from utility rules.

**When to use:** Every `build()` call to produce the `themeCss` and `css` fields.

**Example:**
```typescript
// Source: verified via hands-on testing
function extractLayers(buildOutput: string): { themeCss: string; utilityCss: string } {
  // Theme layer: @layer theme { :root, :host { ... } }
  const themeMatch = buildOutput.match(/@layer theme \{([\s\S]*?)\}\s*(?=@layer)/);
  const themeCss = themeMatch ? themeMatch[1].trim() : '';
  
  // Utilities layer: @layer utilities { ... } at end of output
  const utilMatch = buildOutput.match(/@layer utilities \{([\s\S]*)\}\s*$/);
  const utilityCss = utilMatch ? utilMatch[1].trim() : '';
  
  return { themeCss, utilityCss };
}
```

### Pattern 5: Unmatched Class Detection

**What:** Detect unmatched Tailwind classes by comparing input candidates against generated CSS selectors. Tailwind silently drops unmatched classes (unlike UnoCSS which returns a `matched` set).

**When to use:** Every `build()` call to generate `unmatched-class` warnings.

**Example:**
```typescript
// Source: verified via hands-on testing
function detectUnmatched(candidates: string[], utilityCss: string): string[] {
  // Extract selectors from utilities output
  const selectorRe = /^\s*\.([^\s{]+)\s*\{/gm;
  const generated = new Set<string>();
  let m;
  while ((m = selectorRe.exec(utilityCss)) !== null) {
    // Unescape CSS backslashes to get original class name
    generated.add(m[1].replace(/\\/g, ''));
  }
  
  return candidates.filter(c => !generated.has(c));
}
```

### Anti-Patterns to Avoid

- **Reading CSS files during each `compile()` call:** Read once at module load, not per-call.
- **Using `@tailwindcss/node` or `@tailwindcss/postcss`:** These add filesystem dependencies. Use `tailwindcss` directly with virtual `loadStylesheet`.
- **Not using `source(none)`:** Without it, Tailwind will try to scan the filesystem for candidate classes.
- **Creating a new `compile()` per build call:** `compile()` is 4x more expensive than `build()`. Reuse compilers via cache.
- **Assuming UnoCSS output format:** Tailwind uses CSS nesting (`&:hover {}` inside rule), `@media (hover: hover)` wrappers for hover, and `@media (width >= 40rem)` range syntax for responsive -- all different from UnoCSS. The rewriter (Phase 10) must handle these differences.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS generation | Custom CSS lookup tables | `compile().build()` | Tailwind's engine handles all utilities, variants, arbitrary values natively |
| Theme variable resolution | Custom theme parser + mapper | `@theme {}` block in CSS input | Tailwind resolves `@theme` natively -- vanillify's `src/theme/` is deleted in Phase 11 |
| Custom variant resolution | Custom variant parser + resolver | `@custom-variant` directive in CSS input | Tailwind resolves `@custom-variant` natively -- vanillify's `src/variants/` is deleted in Phase 11 |
| CSS input hashing | crypto.createHash | Simple djb2 hash (already in generator.ts) | CSS inputs are short strings; djb2 is O(n) with no crypto overhead |

## Common Pitfalls

### Pitfall 1: Preflight/Base Layer Bloat
**What goes wrong:** The default `@import "tailwindcss"` includes the full preflight reset (~8KB) in every `build()` output. Vanillify outputs utilities only.
**Why it happens:** Tailwind's default includes `@layer base` (preflight) alongside theme and utilities.
**How to avoid:** Use `@import "tailwindcss" source(none)` and extract only the `@layer utilities` content from output. The theme layer content goes to `themeCss`. The base layer is discarded.
**Warning signs:** Output CSS is unexpectedly large (~5-8KB for simple conversions).

### Pitfall 2: Tailwind's Nesting Syntax Differs from UnoCSS
**What goes wrong:** The rewriter (Phase 10) expects UnoCSS's flat selector format but gets Tailwind's nested CSS.
**Why it happens:** Tailwind v4 uses native CSS nesting: `.hover\:bg-blue-600 { &:hover { @media (hover: hover) { ... } } }` vs UnoCSS's `.hover\:bg-blue-600:hover { ... }`.
**How to avoid:** Phase 9 (this phase) outputs raw Tailwind CSS. Phase 10 adapts the rewriter. Don't try to flatten nesting in the adapter.
**Warning signs:** N/A for Phase 9 -- this becomes relevant in Phase 10.

### Pitfall 3: compile() is Not a Public API
**What goes wrong:** Tailwind updates break the `compile()` signature or behavior.
**Why it happens:** `compile()` is exported but not documented as a stable public API.
**How to avoid:** Pin `tailwindcss@~4.2.2` (patch range only). Isolate all Tailwind imports to one adapter file. The STATE.md decision already captures this.
**Warning signs:** CI failures after `pnpm update`.

### Pitfall 4: Theme Layer Includes Default Variables
**What goes wrong:** The `themeCss` output includes Tailwind's default theme variables (fonts, spacing, all referenced colors) -- not just user-defined ones.
**Why it happens:** Tailwind's `@layer theme` includes all variables that are referenced by generated utilities, plus all user-defined `@theme` variables.
**How to avoid:** This is expected behavior. The `themeCss` field should contain the full `:root, :host { ... }` block. The existing tests (Phase 8 regression baseline) will need updated assertions reflecting this richer output.
**Warning signs:** Theme CSS is much larger than expected.

### Pitfall 5: Unmatched Class Detection is Inference-Based
**What goes wrong:** Unmatched class detection has false negatives for classes that generate CSS but with different selector names.
**Why it happens:** Unlike UnoCSS's explicit `matched` set, Tailwind has no API for "which candidates produced output." Detection relies on parsing CSS output selectors.
**How to avoid:** Parse the `@layer utilities` block for generated selectors, unescape them, and compare against input candidates. This approach was verified to correctly identify unmatched classes in testing.
**Warning signs:** False positives for classes with complex escaping.

### Pitfall 6: loadStylesheet Resolution for Split Imports
**What goes wrong:** If the CSS input uses `@import "tailwindcss/theme.css"` etc. (split imports), the `loadStylesheet` callback is called with `"tailwindcss/theme.css"` as the `id`.
**Why it happens:** Split imports (`@import "tailwindcss/theme.css" layer(theme)`) trigger separate `loadStylesheet` calls for each file.
**How to avoid:** Support both `"tailwindcss"` and `"tailwindcss/*.css"` patterns in `loadStylesheet`. However, the recommended approach uses `@import "tailwindcss" source(none)` (single import) which only triggers one call with `id === "tailwindcss"`.
**Warning signs:** `Error: Cannot resolve stylesheet` during compile.

## Code Examples

### Complete Adapter Module (Recommended Shape)

```typescript
// Source: design based on verified testing of tailwindcss@4.2.2 compile() API
import { compile } from 'tailwindcss';
import type { Warning } from '../types';

// --- Virtual stylesheet resolution ---
// Read CSS content once at module load (not per-call)
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

const require = createRequire(import.meta.url);
const twDir = dirname(require.resolve('tailwindcss/package.json'));
const tailwindIndexCss = readFileSync(resolve(twDir, 'index.css'), 'utf-8');

async function loadStylesheet(id: string, base: string) {
  if (id === 'tailwindcss') {
    return { path: 'virtual:tailwindcss/index.css', base, content: tailwindIndexCss };
  }
  throw new Error(`Vanillify: cannot resolve stylesheet "${id}"`);
}

// --- Compiler cache ---
const _cache = new Map<string, Awaited<ReturnType<typeof compile>>>();

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

// --- Public API ---
export interface TwGenerateCSSResult {
  css: string;
  themeCss: string;
  matched: Set<string>;
  unmatched: string[];
  warnings: Warning[];
}

export async function twGenerateCSS(
  tokens: Set<string>,
  customVariantsCss?: string,
  themeCss?: string,
): Promise<TwGenerateCSSResult> {
  // Build CSS input
  const parts: string[] = ['@import "tailwindcss" source(none);'];
  if (themeCss) parts.push(themeCss);
  if (customVariantsCss) parts.push(customVariantsCss);
  const cssInput = parts.join('\n');

  // Get cached compiler
  const compiler = await getCompiler(cssInput);
  const candidates = [...tokens];
  const output = compiler.build(candidates);

  // Extract layers
  const { themeCss: extractedTheme, utilityCss } = extractLayers(output);

  // Detect unmatched
  const { matched, unmatched } = detectMatches(candidates, utilityCss);

  const warnings: Warning[] = unmatched.map(token => ({
    type: 'unmatched-class' as const,
    message: `Unmatched Tailwind class: "${token}" -- no CSS generated`,
    location: { line: 0, column: 0 },
  }));

  return { css: utilityCss, themeCss: extractedTheme, matched, unmatched, warnings };
}

function extractLayers(output: string) {
  const themeMatch = output.match(/@layer theme \{([\s\S]*?)\}\s*(?=@layer)/);
  const utilMatch = output.match(/@layer utilities \{([\s\S]*)\}\s*$/);
  return {
    themeCss: themeMatch ? themeMatch[1].trim() : '',
    utilityCss: utilMatch ? utilMatch[1].trim() : '',
  };
}

function detectMatches(candidates: string[], utilityCss: string) {
  const selectorRe = /^\s*\.([^\s{]+)\s*\{/gm;
  const generated = new Set<string>();
  let m;
  while ((m = selectorRe.exec(utilityCss)) !== null) {
    generated.add(m[1].replace(/\\/g, ''));
  }
  
  const matched = new Set<string>();
  const unmatched: string[] = [];
  for (const c of candidates) {
    if (generated.has(c)) matched.add(c);
    else unmatched.push(c);
  }
  return { matched, unmatched };
}

export function resetTwGenerator(): void {
  _cache.clear();
}
```

### Key API Shapes (Verified)

```typescript
// Source: tailwindcss@4.2.2 source code + hands-on testing
// compile() signature
const compiler = await compile(cssString, {
  base?: string,
  from?: string,
  loadModule?: (id, base, resourceHint) => Promise<{ path, base, module }>,
  loadStylesheet?: (id, base) => Promise<{ path, base, content }>,
});

// Return shape
compiler.sources  // { base, pattern, negated }[] -- empty when source(none)
compiler.root     // null | 'none' | { base, pattern }
compiler.features // number (bitfield)
compiler.build(candidates: string[]): string  // THE key method
compiler.buildSourceMap(): DecodedSourceMap
```

### CSS Output Structure (Verified)

```css
/* build() output for: ['flex', 'p-4', 'bg-blue-500', 'hover:bg-blue-600'] */

/*! tailwindcss v4.2.2 | MIT License | https://tailwindcss.com */
@layer theme, base, components, utilities;
@layer theme {
  :root, :host {
    --color-blue-500: oklch(62.3% 0.214 259.815);
    --color-blue-600: oklch(54.6% 0.245 262.881);
    --spacing: 0.25rem;
    /* ... only variables referenced by generated utilities ... */
  }
}
@layer base {
  /* Full preflight reset -- ~100 lines, vanillify discards this */
}
@layer utilities {
  .flex { display: flex; }
  .bg-blue-500 { background-color: var(--color-blue-500); }
  .p-4 { padding: calc(var(--spacing) * 4); }
  .hover\:bg-blue-600 {
    &:hover {
      @media (hover: hover) {
        background-color: var(--color-blue-600);
      }
    }
  }
}
```

## State of the Art

| Old Approach (UnoCSS) | New Approach (Tailwind compile) | Impact |
|------------------------|-------------------------------|--------|
| `createGenerator({ presets: [presetWind4()] })` | `compile('@import "tailwindcss" source(none);', { loadStylesheet })` | Direct Tailwind engine, 100% fidelity |
| `generator.generate(tokens)` returns `{ css, matched }` | `compiler.build(candidates)` returns CSS string | No `matched` set -- must parse output |
| Custom theme parser + mapper (3 files) | `@theme {}` block in CSS input | Tailwind handles natively |
| Custom variant resolver (3 files) | `@custom-variant` directive in CSS input | Tailwind handles natively |
| `result.matched` for unmatched detection | Parse CSS output selectors | Inference-based, verified reliable |
| Flat CSS selectors (`.hover\:bg-blue-700:hover`) | Nested CSS (`.hover\:bg-blue-600 { &:hover { @media (hover: hover) { ... } } }`) | Rewriter must adapt (Phase 10) |
| `/* layer: theme */` comment markers | `@layer theme { ... }` block | Different extraction regex needed |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `createRequire(import.meta.url)` works in the tsdown ESM build to resolve tailwindcss path | Code Examples | Medium -- may need alternative resolution strategy. Fallback: `import.meta.resolve('tailwindcss')` |
| A2 | `readFileSync` at module load time is acceptable for a build-time tool | Architecture Patterns | Low -- vanillify is explicitly a build-time tool, not runtime |
| A3 | The `@layer utilities { ... }` regex extraction is reliable across all Tailwind build outputs | Pattern 4 | Medium -- edge cases with nested `@layer` or comments could break regex. Test thoroughly. |

## Open Questions

1. **How to handle `import.meta.url` resolution in dual ESM/CJS build?**
   - What we know: `createRequire` works in ESM, `require.resolve` works in CJS.
   - What's unclear: Whether tsdown's dual output handles this correctly.
   - Recommendation: Use `createRequire(import.meta.url)` and test both builds. If CJS fails, fall back to `require.resolve('tailwindcss/package.json')`.

2. **Should the adapter match `GenerateCSSResult` interface exactly or define its own?**
   - What we know: The existing interface has `matched: Set<string>` which UnoCSS provides natively. Tailwind requires inference.
   - What's unclear: Whether Phase 10 needs the `matched` set or just `unmatched`.
   - Recommendation: Match the existing `GenerateCSSResult` interface shape to minimize Phase 10 changes. The `matched` set can be reconstructed from `candidates - unmatched`.

3. **Per-node compile() vs shared compiler with per-node build()?**
   - What we know: STATE.md says "fresh compile() per node for isolation." But testing shows build() produces isolated output per call already.
   - What's unclear: Whether there are edge cases where shared compiler state leaks between build() calls.
   - Recommendation: Start with shared compiler (one compile() per CSS input), separate build() per node. The build() output is deterministic and stateless per call based on testing. This is 4x faster than per-node compile(). If isolation issues arise, fall back to per-node compile().

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| tailwindcss | CSS generation engine | Not yet installed | 4.2.2 (npm) | None -- required |
| Node.js | Runtime | Available | v20+ | -- |

**Missing dependencies with no fallback:**
- `tailwindcss@~4.2.2` must be installed via `pnpm add tailwindcss@~4.2.2`

## Sources

### Primary (HIGH confidence)
- [tailwindcss@4.2.2 npm registry](https://www.npmjs.com/package/tailwindcss) -- version verified via `npm view tailwindcss version`
- [tailwindcss source: packages/tailwindcss/src/index.ts](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/src/index.ts) -- compile() signature, CompileOptions type, build() return type
- [Hands-on testing](/tmp/tw-test/) -- compile(), build(), loadStylesheet, source(none), layer extraction, unmatched detection all verified locally against tailwindcss@4.2.2

### Secondary (MEDIUM confidence)
- [GitHub Discussion #16581: How to use Tailwind 4 programmatically](https://github.com/tailwindlabs/tailwindcss/discussions/16581) -- community usage patterns, loadStylesheet callback examples
- [GitHub Discussion #18356: Runtime Tailwind CSS Compilation after v4.1](https://github.com/tailwindlabs/tailwindcss/discussions/18356) -- confirms compile() API is unstable/undocumented
- [GitHub Discussion #15881: Programmatic compilation](https://github.com/tailwindlabs/tailwindcss/discussions/15881) -- official suggestion to reference CLI source
- [GitHub Discussion #17135: Disable Preflight with source(none)](https://github.com/tailwindlabs/tailwindcss/discussions/17135) -- split import approach for excluding base layer

### Tertiary (LOW confidence)
- None -- all findings verified via direct testing.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- `tailwindcss@4.2.2` verified, `compile()` API tested
- Architecture: HIGH -- all patterns verified via hands-on testing against actual API
- Pitfalls: HIGH -- discovered through actual testing, not speculation

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (stable -- pinned version, tested API)
