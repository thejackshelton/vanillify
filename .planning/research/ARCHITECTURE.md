# Architecture Patterns

**Domain:** Integration of vite-plus, magic-regexp, pnpm, and @theme support into existing vanillify library
**Researched:** 2026-04-05
**Confidence:** HIGH for toolchain changes, MEDIUM for @theme integration

## Existing Architecture Overview

The current vanillify pipeline is a clean, linear async flow:

```
convert(source, filename, options)
  1. parse(filename, source)         -> AST            [src/pipeline/parser.ts]
  2. extract(program, source)        -> NodeEntry[]    [src/pipeline/extractor.ts]
  3. assignNames(entries)            -> NameMap         [src/pipeline/namer.ts]
  4. resolveCustomVariants(options)  -> VariantObject[] [src/variants/resolver.ts]
  5. rewrite(source, entries, ...)   -> ConvertResult   [src/pipeline/rewriter.ts]
     5a. generateCSS(tokens, variants) per node        [src/pipeline/generator.ts]
     5b. buildNodeCSS() selector rewriting
     5c. source string replacement
```

Key architectural property: `generator.ts` maintains a **generator cache** (`_cache`) keyed by variant configuration identity. The `createGenerator()` call is expensive and cached.

---

## Integration Point 1: vite-plus Unified Config

### What Changes

**Files removed:**
- `tsdown.config.ts` -- absorbed into `vite.config.ts` under `pack` key
- `vitest.config.ts` -- absorbed into `vite.config.ts` under `test` key

**Files created:**
- `vite.config.ts` -- single unified config using `import { defineConfig } from 'vite-plus'`

**Files modified:**
- `package.json` -- scripts change, `vite-plus` replaces `tsdown` + `vitest` dev deps

### Unified Config Shape

```typescript
// vite.config.ts
import { defineConfig } from 'vite-plus'

export default defineConfig({
  // tsdown configuration (replaces tsdown.config.ts)
  pack: {
    entry: ['./src/index.ts', './src/cli.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
  },

  // vitest configuration (replaces vitest.config.ts)
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
})
```

### Script Changes in package.json

```json
{
  "scripts": {
    "build": "vp pack",
    "test": "vp test run",
    "test:watch": "vp test",
    "typecheck": "tsc --noEmit",
    "lint": "vp lint",
    "fmt": "vp fmt"
  },
  "devDependencies": {
    "vite-plus": "^0.x.x"
    // removes: "tsdown", "vitest" (vite-plus bundles both)
  }
}
```

### Impact on src/ Structure

**None.** vite-plus is purely a build/test toolchain wrapper. It does not affect source code, imports, or the runtime pipeline. The `src/` directory structure stays identical.

### Confidence: HIGH

vite-plus `pack` accepts all tsdown config options. The migration is a config file reorganization, not a code change. The entry points, format, and dts options map 1:1.

---

## Integration Point 2: magic-regexp

### Which Source Files Contain Regex

Every regex pattern in `src/` that needs conversion:

**`src/pipeline/generator.ts`** (1 pattern):
| Line | Current Regex | Purpose |
|------|--------------|---------|
| 50 | `/@layer\s+[\w-]+\s*\{/g` | Match @layer block openers in CSS output |

**`src/pipeline/extractor.ts`** (3 patterns, all identical):
| Line | Current Regex | Purpose |
|------|--------------|---------|
| 33 | `/\s+/` | Split class string by whitespace |
| 78 | `/\s+/` | Split class string by whitespace (dynamic) |
| 93 | `/\s+/` | Split template literal quasis by whitespace |

**`src/pipeline/rewriter.ts`** (5 patterns):
| Line | Current Regex | Purpose |
|------|--------------|---------|
| 97 | `/[.*+?^${}()\|[\]\\]/g` | Escape string for regex use |
| 107 | `/([[\]#()/:,.%@!])/g` | Escape CSS selector special chars |
| 216 | `new RegExp(pattern + '(?:[:{\\s]|$)')` | Dynamic: match utility selector in CSS line |
| 217 | -- | (`.test()` call on above) |
| 220 | `/\\\\/g` | Normalize backslash escaping for fallback match |

**`src/variants/parser.ts`** (2 patterns):
| Line | Current Regex | Purpose |
|------|--------------|---------|
| 7 | `/@custom-variant\s+([\w-]+)\s+\(([^)]+)\)\s*;/g` | Parse @custom-variant directives |
| 34 | `/^[\w-]+$/` | Validate variant name (no CSS special chars) |

**`src/variants/resolver.ts`** (1 pattern):
| Line | Current Regex | Purpose |
|------|--------------|---------|
| 29 | `/&/g` | Replace `&` placeholder in selector template |

**`src/cli.ts`** (2 patterns):
| Line | Current Regex | Purpose |
|------|--------------|---------|
| 64 | `/\.(tsx?\|jsx?)$/` | Strip file extension for output name |
| 65 | `/\.(tsx?\|jsx?)$/` | Match file extension |

### Total: 14 regex instances across 6 files

### Import/Usage Pattern

```typescript
import {
  createRegExp,
  exactly,
  oneOrMore,
  maybe,
  anyOf,
  charIn,
  charNotIn,
  whitespace,
  wordChar,
  letter,
  digit,
} from 'magic-regexp'

// Example: /@layer\s+[\w-]+\s*\{/g becomes:
const LAYER_RE = createRegExp(
  exactly('@layer'),
  oneOrMore(whitespace),
  oneOrMore(anyOf(wordChar, exactly('-'))),
  whitespace.times.any(),
  exactly('{'),
  ['g']
)
```

### Candidacy Assessment

| File | Patterns | Conversion Difficulty | Recommended |
|------|----------|----------------------|-------------|
| `variants/parser.ts` | 2 | Easy -- static patterns, clear structure | YES |
| `variants/resolver.ts` | 1 | Trivial -- simple `&` replacement | YES |
| `cli.ts` | 2 | Easy -- file extension matching | YES |
| `pipeline/generator.ts` | 1 | Easy -- @layer pattern | YES |
| `pipeline/extractor.ts` | 3 | Trivial -- whitespace split | YES (or leave as `/\s+/`) |
| `pipeline/rewriter.ts` | 5 | HARD -- dynamic regex construction at line 216 | PARTIAL |

### The rewriter.ts Problem

`rewriter.ts` line 216 constructs regex **dynamically** from user-provided class names:

```typescript
const re = new RegExp(pattern + '(?:[:{\\s]|$)')
```

magic-regexp compiles patterns at build time. Dynamic regex construction is explicitly outside its scope. This pattern **cannot** be converted to magic-regexp.

**Recommendation:** Convert 9 of 14 patterns to magic-regexp. Leave the 5 patterns in `rewriter.ts` as-is, with a comment explaining why (dynamic construction). The `escapeRegex()` and `buildSelectorPattern()` helper functions in rewriter.ts are regex-escaping utilities that operate on raw strings -- they stay as-is.

### Performance Implications

magic-regexp compiles to pure RegExp at build time via a Vite/Rolldown transform. At runtime, the generated code is identical to hand-written RegExp. **Zero performance cost** -- it is a DX improvement only.

The build-time transform requires a Vite plugin. With vite-plus, this integrates naturally:

```typescript
// vite.config.ts
import { defineConfig } from 'vite-plus'
import MagicRegexp from 'magic-regexp/transform'

export default defineConfig({
  plugins: [MagicRegexp()],
  // ... pack, test configs
})
```

**Important:** The transform must also apply during testing (vitest inherits vite plugins, so this works automatically with vite-plus unified config).

### Confidence: HIGH for static patterns, N/A for dynamic patterns (rewriter.ts stays raw RegExp)

---

## Integration Point 3: @theme Support

### The Problem

Tailwind v4 users define design tokens in CSS via `@theme` blocks:

```css
@theme {
  --color-brand-500: oklch(0.72 0.11 221.19);
  --spacing-18: 4.5rem;
  --font-display: "Satoshi", sans-serif;
}
```

These tokens create new utility classes (e.g., `bg-brand-500`, `p-18`, `font-display`). Without theme resolution, vanillify's `generateCSS()` cannot match these tokens -- they show up as `unmatched-class` warnings.

### Where in the Pipeline

Theme resolution must happen **before `createGenerator()` is called** -- specifically, theme values must be injected into the UnoCSS generator config so the generator knows about custom tokens when matching utilities.

```
convert(source, filename, options)
  1. parse
  2. extract
  3. assignNames
  4. resolveCustomVariants          <-- existing
  4b. resolveTheme(options.theme)   <-- NEW: parse @theme, produce UnoCSS theme config
  5. rewrite
     5a. generateCSS(tokens, variants, themeConfig)  <-- MODIFIED: pass theme
         -> getGenerator(variants, themeConfig)       <-- MODIFIED: cache key includes theme
```

### Detailed Architecture

**New file: `src/theme/parser.ts`**

Parses `@theme` CSS blocks into a structured theme object. This is analogous to `src/variants/parser.ts` -- it takes a CSS string and extracts structured data.

```typescript
export interface ParsedTheme {
  colors: Record<string, string>      // --color-* -> { 'brand-500': 'oklch(...)' }
  spacing: Record<string, string>     // --spacing-* -> { '18': '4.5rem' }
  fonts: Record<string, string>       // --font-* -> { 'display': '"Satoshi", sans-serif' }
  radius: Record<string, string>      // --radius-*
  shadows: Record<string, string>     // --shadow-*
  breakpoints: Record<string, string> // --breakpoint-*
  raw: Record<string, string>         // All --key: value pairs as-is
}

export function parseThemeCSS(css: string): ParsedTheme
```

The parser extracts CSS custom property declarations from within `@theme { ... }` blocks and categorizes them by namespace prefix.

**New file: `src/theme/resolver.ts`**

Converts `ParsedTheme` into UnoCSS `theme` config object format:

```typescript
import type { ParsedTheme } from './parser'

export interface ThemeConfig {
  colors?: Record<string, string>
  // ... other UnoCSS theme keys mapped from ParsedTheme
}

export function resolveTheme(input: ThemeOption): ThemeConfig
```

The mapping from Tailwind v4 namespace to UnoCSS preset-wind4 theme key:

| Tailwind v4 Namespace | UnoCSS Wind4 Theme Key | Notes |
|----------------------|------------------------|-------|
| `--color-*` | `colors` | Direct mapping |
| `--font-*` | `font` | Wind4 uses `font` not `fontFamily` |
| `--spacing-*` | `spacing` | Direct mapping |
| `--radius-*` | `radius` | Wind4 uses `radius` not `borderRadius` |
| `--shadow-*` | `shadow` | Wind4 uses `shadow` not `boxShadow` |
| `--breakpoint-*` | `breakpoint` | Wind4 uses `breakpoint` not `breakpoints` |
| `--text-*` | `text` | Font size utilities |
| `--ease-*` | `ease` | Timing functions |
| `--blur-*` | `blur` | Filter blur values |

**New file: `src/theme/types.ts`**

```typescript
export type ThemeOption = string | Record<string, string>
// string = CSS containing @theme blocks
// Record = pre-parsed key-value pairs (--namespace-name: value)
```

### Interaction with Generator Cache

The generator cache in `src/pipeline/generator.ts` is currently keyed by variant identity:

```typescript
const key = customVariants?.length
  ? customVariants.map(v => `${v.name}:${String(v.match)}`).sort().join(',')
  : '__default__'
```

With theme support, the cache key must incorporate theme identity:

```typescript
export async function getGenerator(
  customVariants?: VariantObject[],
  themeConfig?: ThemeConfig,        // NEW parameter
): Promise<...> {
  const variantKey = customVariants?.length
    ? customVariants.map(v => `${v.name}:${String(v.match)}`).sort().join(',')
    : ''
  const themeKey = themeConfig
    ? JSON.stringify(themeConfig)    // Theme configs are serializable plain objects
    : ''
  const key = `${variantKey}||${themeKey}` || '__default__'

  let gen = _cache.get(key)
  if (!gen) {
    gen = await createGenerator({
      presets: [presetWind4()],
      ...(customVariants?.length ? { variants: customVariants } : {}),
      ...(themeConfig ? { theme: themeConfig } : {}),
    })
    _cache.set(key, gen)
  }
  return gen
}
```

### API Surface Change

`ConvertOptions` in `src/types.ts` gains a new optional field:

```typescript
export interface ConvertOptions {
  customVariants?: CustomVariantsOption  // existing
  theme?: ThemeOption                    // NEW
}
```

The `convert()` function in `src/index.ts` passes the resolved theme config through to `rewrite()` -> `generateCSS()` -> `getGenerator()`.

### CLI Change

`src/cli.ts` gains a `--theme` flag:

```typescript
args: {
  // ... existing args
  theme: {
    type: 'string',
    alias: 't',
    description: 'Path to CSS file with @theme definitions',
  },
}
```

### Data Flow with Theme

```
User provides:                    @theme { --color-brand: oklch(...); }
                                         |
src/theme/parser.ts:              parseThemeCSS(css)
                                         |
                                  ParsedTheme { colors: { brand: 'oklch(...)' } }
                                         |
src/theme/resolver.ts:            resolveTheme(parsed)
                                         |
                                  ThemeConfig { colors: { brand: 'oklch(...)' } }
                                         |
src/pipeline/generator.ts:        createGenerator({ presets: [presetWind4()], theme: themeConfig })
                                         |
                                  Generator now recognizes bg-brand, text-brand, etc.
```

### Risk: preset-wind4 Theme Key Compatibility

The UnoCSS preset-wind4 uses **different theme key names** than both Tailwind v4's CSS namespace conventions and UnoCSS's own wind3 preset. The resolver must map between them correctly. This is a known translation layer that needs careful testing.

Key risk: preset-wind4 is "not fully ready" per maintainers. Some theme keys may not be supported or may behave differently. The resolver should emit warnings for unresolvable theme namespaces.

### Confidence: MEDIUM

The approach (parse @theme -> inject into UnoCSS theme config) is sound and follows the same pattern as custom variants. The uncertainty is in the exact preset-wind4 theme key mappings -- these need validation through integration tests with real @theme blocks.

---

## Integration Point 4: pnpm Migration

### Files Changed

| File | Change | Impact |
|------|--------|--------|
| `package-lock.json` | **Deleted** | Replaced by pnpm-lock.yaml |
| `pnpm-lock.yaml` | **Created** | New lockfile from `pnpm install` |
| `.npmrc` | **Created** (optional) | pnpm settings if needed |
| `package.json` | No changes needed | Scripts stay the same |

### Impact on Build/Test Pipeline

**None.** pnpm is a drop-in package manager replacement. The `node_modules/` layout is compatible. Build and test scripts work identically.

### Migration Steps

```bash
rm package-lock.json
rm -rf node_modules
pnpm install
```

### Confidence: HIGH

pnpm is a package manager swap with no code impact.

---

## Updated Component Boundaries

| Component | Responsibility | Status |
|-----------|---------------|--------|
| `src/index.ts` | Pipeline orchestration | MODIFIED: passes theme option |
| `src/pipeline/parser.ts` | AST parsing | Unchanged |
| `src/pipeline/extractor.ts` | Class extraction from AST | Minor: magic-regexp for whitespace split |
| `src/pipeline/namer.ts` | Indexed class naming | Unchanged |
| `src/pipeline/rewriter.ts` | Source rewriting + CSS assembly | Partial magic-regexp (static patterns only) |
| `src/pipeline/generator.ts` | UnoCSS createGenerator wrapper | MODIFIED: theme in cache key + config; magic-regexp for @layer pattern |
| `src/variants/parser.ts` | @custom-variant CSS parsing | magic-regexp conversion |
| `src/variants/resolver.ts` | Variant -> VariantObject conversion | Minor: magic-regexp for `&` replacement |
| `src/theme/parser.ts` | **NEW**: @theme CSS block parsing | New file |
| `src/theme/resolver.ts` | **NEW**: ParsedTheme -> UnoCSS theme config | New file |
| `src/theme/types.ts` | **NEW**: Theme type definitions | New file |
| `src/types.ts` | Shared types | MODIFIED: ThemeOption in ConvertOptions |
| `src/cli.ts` | CLI entry point | MODIFIED: `--theme` flag, magic-regexp |
| `vite.config.ts` | **NEW**: Unified vite-plus config | Replaces tsdown.config.ts + vitest.config.ts |

## Suggested Build Order

The features have the following dependency graph:

```
pnpm (independent, zero-risk)
  |
vite-plus (independent, but do after pnpm so lockfile is pnpm-based)
  |
magic-regexp (requires vite-plus for build transform plugin in vite.config.ts)
  |
@theme support (independent of above three, but benefits from magic-regexp being available for its parser)
```

**Recommended phase order:**

1. **pnpm migration** -- Zero risk, zero code changes. Establishes the package manager before touching configs.

2. **vite-plus unified config** -- Removes tsdown.config.ts + vitest.config.ts, creates vite.config.ts. Must happen before magic-regexp because the magic-regexp transform plugin goes in vite.config.ts.

3. **magic-regexp conversion** -- Requires vite-plus config to be in place (for the build-time transform plugin). Convert 9 of 14 patterns; leave rewriter.ts dynamic patterns as-is.

4. **@theme support** -- Largest feature. New `src/theme/` directory with parser + resolver. Modifications to generator cache, types, index.ts, and cli.ts. Should be last because it is the only feature that changes the runtime pipeline and API surface.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Parsing @theme with regex in isolation
**What:** Writing a standalone regex parser for @theme blocks without leveraging the existing variant parser pattern.
**Why bad:** The `src/variants/parser.ts` already establishes the pattern for parsing CSS directives. Diverging creates inconsistency.
**Instead:** Follow the same structure: `src/theme/parser.ts` mirrors `src/variants/parser.ts` in shape, testing approach, and error handling (MAX_INPUT_LENGTH guard, validate parsed values, return empty array for malformed input).

### Anti-Pattern 2: Forcing magic-regexp on dynamic patterns
**What:** Trying to use magic-regexp for the `new RegExp(pattern + ...)` construction in rewriter.ts.
**Why bad:** magic-regexp is a compile-time transform. Dynamic regex is inherently runtime. Forcing it would require restructuring the CSS selector matching approach entirely.
**Instead:** Leave dynamic patterns as raw RegExp. Add a `// magic-regexp: skip -- dynamic construction` comment.

### Anti-Pattern 3: Theme resolution as post-processing
**What:** Letting generateCSS() produce output, then trying to "fix up" unmatched theme tokens after the fact.
**Why bad:** UnoCSS needs theme values at generator creation time to match utilities correctly. Post-processing cannot recover what the generator never matched.
**Instead:** Theme config must be resolved BEFORE `createGenerator()` is called and passed into the generator config.

### Anti-Pattern 4: Separate generator cache for theme vs non-theme
**What:** Creating a second cache Map for theme-aware generators.
**Why bad:** Splits the caching logic, makes invalidation harder, adds complexity.
**Instead:** Extend the existing cache key to incorporate theme identity. One cache, one lookup path.

### Anti-Pattern 5: Converting /\s+/ splits to magic-regexp
**What:** Replacing simple, universally understood `/\s+/` with `createRegExp(oneOrMore(whitespace))` in `String.split()` calls.
**Why bad:** The magic-regexp version is longer, less readable for a trivial pattern, and adds overhead to the import. The value of magic-regexp is for complex patterns, not simple ones.
**Instead:** Leave `/\s+/` as-is in `extractor.ts` split calls. Only convert patterns where readability genuinely improves (the @layer pattern, @custom-variant pattern, file extension matching).

## Sources

- [Vite+ Configuration](https://viteplus.dev/config/) -- unified defineConfig API with pack, test, lint, fmt keys
- [Vite+ Pack Guide](https://viteplus.dev/guide/pack) -- tsdown integration via pack block
- [Vite+ GitHub](https://github.com/voidzero-dev/vite-plus) -- repository and release context
- [magic-regexp Usage](https://regexp.dev/guide/usage) -- createRegExp, helpers, build-time transform
- [UnoCSS Theme Configuration](https://unocss.dev/config/theme) -- theme property, extendTheme, colors/breakpoints
- [UnoCSS preset-wind4](https://unocss.dev/presets/wind4) -- wind4-specific theme keys, CSS variable generation
- [Tailwind v4 Theme Variables](https://tailwindcss.com/docs/theme) -- @theme block syntax, namespace conventions

---
*Architecture research for: vanillify v1.1 -- vite-plus, magic-regexp, pnpm, @theme integration*
*Researched: 2026-04-05*
