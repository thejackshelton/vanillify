# Stack Research: v1.1 Toolchain & Theme Support

**Domain:** TypeScript library — Tailwind-to-vanilla-CSS converter (milestone additions)
**Researched:** 2026-04-05
**Confidence:** MEDIUM-HIGH (vite-plus and magic-regexp HIGH, @theme support MEDIUM due to needing custom layer)

**Scope:** This document covers ONLY the new stack additions for v1.1. For the existing validated stack (UnoCSS createGenerator, oxc-parser, citty, consola), see the v1.0 research archive.

---

## New Stack Additions

### 1. vite-plus (Unified Toolchain)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `vite-plus` | ^0.1.15 | Unified config for build, test, lint, format | Replaces separate tsdown.config.ts, vitest.config.ts, eslint config, and prettier config with a single `vite.config.ts`. tsdown, vitest, oxlint, and oxfmt are all managed under one `defineConfig`. This is the direction the VoidZero ecosystem is going — vanillify should adopt it now rather than accumulate config debt. |

**Confidence:** HIGH — Official VoidZero project, active development, migration path documented.

#### defineConfig API

```typescript
import { defineConfig } from 'vite-plus'

export default defineConfig({
  // --- Standard Vite ---
  server: {},
  build: {},
  preview: {},

  // --- Vite+ extensions ---
  pack: {
    // tsdown config moves here
    entry: ['src/index.ts'],
    dts: true,
    format: ['esm', 'cjs'],
  },
  test: {
    // vitest config moves here
    environment: 'node',
    coverage: { provider: 'v8' },
  },
  lint: {
    // oxlint config — replaces @antfu/eslint-config + oxlint
  },
  fmt: {
    // oxfmt config — replaces prettier
  },
  staged: {
    // replaces lint-staged
    '*.{js,ts,tsx}': 'vp check --fix',
  },
  run: {
    // vite task runner
  },
})
```

#### CLI Commands

| Command | Replaces | Notes |
|---------|----------|-------|
| `vp pack` | `tsdown` | Builds the library with tsdown under the hood |
| `vp test` | `vitest run` | Single test pass (NOT watch by default) |
| `vp test --watch` | `vitest` | Watch mode |
| `vp lint` | `eslint` / `oxlint` | Uses Oxlint (600+ ESLint-compatible rules, 100x faster) |
| `vp fmt` | `prettier` | Uses Oxfmt (99%+ Prettier compatible) |
| `vp check` | `vp lint && vp fmt` | Combined lint + format |
| `vp build` | `vite build` | Standard Vite build |

#### Migration Path

The `vp migrate` command automates most of the transition:

1. Run `vp migrate` in the project root
2. It merges tsdown.config.ts into the `pack` block
3. It merges vitest.config.ts into the `test` block
4. It updates lint/format configs into `lint`/`fmt` blocks
5. Updates `package.json` scripts to use `vp` commands
6. Test imports change: `import { describe, it, expect } from 'vite-plus/test'`

**Critical change:** Vitest imports move from `'vitest'` to `'vite-plus/test'`. This is the main code change beyond config consolidation.

#### What Gets Removed

| Remove | Replaced By |
|--------|------------|
| `tsdown.config.ts` | `pack` block in `vite.config.ts` |
| `vitest.config.ts` | `test` block in `vite.config.ts` |
| `.eslintrc` / `eslint.config.js` | `lint` block in `vite.config.ts` |
| `.prettierrc` | `fmt` block in `vite.config.ts` |
| `@antfu/eslint-config` (devDep) | Built-in Oxlint |
| `oxlint` (separate devDep) | Built into vite-plus |
| `prettier` (devDep) | Built-in Oxfmt |

---

### 2. magic-regexp (Readable Regex)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `magic-regexp` | ^0.11.0 | Type-safe, readable regex alternative | From the UnJS ecosystem (same as citty, consola, pathe). Compiles away at build time to pure RegExp — zero runtime overhead. Replaces raw regex patterns throughout vanillify with readable, chainable, typed expressions. Particularly valuable for CSS class pattern matching where regex correctness is critical. |

**Confidence:** HIGH — Stable UnJS package, well-documented, zero runtime cost.

#### Core API

```typescript
import {
  createRegExp,
  exactly,
  oneOrMore,
  maybe,
  anyOf,
  digit,
  word,
  wordChar,
  whitespace,
  char,
  charIn,
  charNotIn,
  not,
} from 'magic-regexp'
```

#### Pattern Composition

```typescript
// Chaining methods on any Input:
pattern
  .and(otherPattern)        // sequential concatenation
  .or(alternative)          // alternation
  .times(3)                 // exact repetition
  .times.between(1, 5)     // range
  .times.atLeast(1)        // minimum
  .times.any()             // zero or more (*)
  .optionally()            // zero or one (?)
  .groupedAs('name')       // named capture group
  .grouped()               // anonymous capture group
  .after(lookbehind)       // positive lookbehind
  .before(lookahead)       // positive lookahead
  .notAfter(pattern)       // negative lookbehind
  .notBefore(pattern)      // negative lookahead
  .at.lineStart()          // ^ anchor
  .at.lineEnd()            // $ anchor
```

#### Example: Replacing Vanillify Regex Patterns

```typescript
// BEFORE: Raw regex for matching Tailwind class strings
const classRegex = /class(?:Name)?=["']([^"']+)["']/g

// AFTER: magic-regexp equivalent
const classPattern = createRegExp(
  exactly('class')
    .and(maybe(exactly('Name')))
    .and(exactly('='))
    .and(charIn(`"'`))
    .and(oneOrMore(charNotIn(`"'`)).groupedAs('classes'))
    .and(charIn(`"'`)),
  ['g']
)

// BEFORE: CSS variable pattern
const cssVarRegex = /var\(--[\w-]+\)/

// AFTER:
const cssVarPattern = createRegExp(
  exactly('var(--')
    .and(oneOrMore(anyOf(wordChar, exactly('-'))))
    .and(exactly(')'))
)
```

#### Build-Time Compilation

magic-regexp ships with a transform (unplugin-based) that compiles the readable patterns to pure RegExp at build time. With vite-plus, this integrates naturally since tsdown (via `vp pack`) supports unplugin transforms.

**However:** For a library, the transform is optional. Without it, magic-regexp still works at runtime with minimal overhead (just the builder functions). The compiled-away behavior is a bonus, not a requirement.

#### Limitations

- No lookbehind on older engines (but we target Node 20+ which supports it)
- Pattern debugging requires understanding what the builder produces — use `.toString()` on the result to see the raw regex
- Complex patterns (deeply nested alternations) can be harder to read than raw regex — use judgment on when magic-regexp adds clarity vs obscures intent

---

### 3. pnpm (Package Manager)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `pnpm` | ^9.x | Package manager | Strict dependency isolation (prevents phantom dependencies), content-addressable store (faster installs, less disk usage), and it's the standard in the VoidZero/Vite ecosystem. vite-plus itself manages pnpm as a runtime concern. |

**Confidence:** HIGH — Standard migration, well-documented, no compatibility concerns.

#### Migration Steps

```bash
# 1. Install pnpm globally (if not already)
npm install -g pnpm

# 2. Import existing lockfile
pnpm import  # Creates pnpm-lock.yaml from package-lock.json

# 3. Remove npm artifacts
rm -rf node_modules package-lock.json

# 4. Install with pnpm
pnpm install

# 5. Verify
pnpm test
pnpm build
```

#### Config Changes

Create `.npmrc` for pnpm settings:

```ini
# .npmrc
shamefully-hoist=false
strict-peer-dependencies=true
auto-install-peers=true
```

**Note on shamefully-hoist:** Set to `false` (default). Vanillify's deps are all well-packaged (UnoCSS, oxc-parser, UnJS packages) and don't rely on phantom hoisting. If a dep breaks under strict mode, it's a bug to fix, not a reason to hoist.

#### Package.json Script Updates

```json
{
  "scripts": {
    "build": "vp pack",
    "test": "vp test",
    "lint": "vp lint",
    "fmt": "vp fmt",
    "check": "vp check"
  },
  "packageManager": "pnpm@9.15.0"
}
```

The `packageManager` field enables Corepack enforcement — anyone cloning the repo and running `corepack enable` will automatically use the correct pnpm version.

#### Compatibility Notes

- `oxc-parser` ships platform-specific binaries via `optionalDependencies` — pnpm handles this correctly
- `@unocss/*` packages are all published with proper peer dependency declarations — no hoisting issues expected
- `vite-plus` is designed to work with pnpm (VoidZero dogfoods pnpm)
- No workspace file needed (vanillify is a single package, not a monorepo)

---

### 4. Tailwind v4 @theme Block Support

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| UnoCSS `theme` config + `extendTheme` | (uses existing `@unocss/core` ^66.x) | Map Tailwind v4 `@theme` blocks to UnoCSS theme configuration | preset-wind4 does NOT support `@theme` blocks natively. Vanillify must parse `@theme` CSS blocks itself and translate them to UnoCSS's programmatic `theme` object. This is the same pattern as the `@custom-variant` layer — vanillify bridges the gap between Tailwind v4 CSS syntax and UnoCSS's JS config. |

**Confidence:** MEDIUM — The approach is sound (UnoCSS theme API is stable), but the mapping from Tailwind v4 theme variables to UnoCSS theme keys requires careful implementation.

#### The @theme Question: Definitive Answer

**Does preset-wind4 handle Tailwind v4 `@theme` blocks natively? NO.**

Evidence:
1. The UnoCSS issue #4411 (Tailwind 4 Support Plan) lists "Integrate css configuration file" as an outstanding/incomplete task — this is what `@theme` blocks are.
2. The preset-wind4 documentation describes theme configuration exclusively through JavaScript objects (`presetWind4({ theme: {} })`), with no mention of CSS-based `@theme` parsing.
3. The UnoCSS theme documentation shows only programmatic `theme` and `extendTheme` APIs.
4. The maintainer explicitly stated preset-wind4 is "not fully ready yet" — CSS config file support (which includes `@theme`) is the primary gap.

**Does preset-wind3 handle it? NO.** `@theme` is a Tailwind v4 feature. Wind3 targets Tailwind v3 semantics which used `tailwind.config.js`, not CSS-based theme configuration.

#### What Tailwind v4 @theme Actually Does

```css
@import "tailwindcss";

@theme {
  --color-primary: #3490dc;
  --color-secondary: #ffed4a;
  --font-display: "Inter", sans-serif;
  --spacing-18: 4.5rem;
  --radius-pill: 9999px;
}
```

`@theme` blocks define CSS custom properties that serve a dual purpose:
1. They become CSS variables available at runtime (`var(--color-primary)`)
2. They instruct Tailwind to generate corresponding utility classes (`text-primary`, `bg-secondary`, `font-display`, `spacing-18`, `rounded-pill`)

The variable naming convention maps to utility classes: `--color-*` maps to color utilities, `--font-*` to font utilities, `--spacing-*` to spacing utilities, etc.

#### Vanillify's Approach: Parse @theme, Feed UnoCSS Theme API

```typescript
// Step 1: Parse @theme block from user's CSS (using regex or a simple CSS parser)
// Input: "@theme { --color-primary: #3490dc; --spacing-18: 4.5rem; }"
// Output: { colors: { primary: '#3490dc' }, spacing: { '18': '4.5rem' } }

// Step 2: Map Tailwind v4 variable names to UnoCSS theme keys
// Tailwind v4 --color-*  → UnoCSS theme.colors.*
// Tailwind v4 --font-*   → UnoCSS theme.font.*        (Wind4 key)
// Tailwind v4 --spacing-* → UnoCSS theme.spacing.*
// Tailwind v4 --radius-*  → UnoCSS theme.radius.*      (Wind4 key)
// Tailwind v4 --text-*    → UnoCSS theme.text.*         (Wind4 key)

// Step 3: Pass to createGenerator
import { createGenerator } from '@unocss/core'
import presetWind4 from '@unocss/preset-wind4'

const generator = createGenerator({
  presets: [presetWind4()],
  theme: parsedThemeObject,        // from step 2
  // OR use extendTheme for merging:
  extendTheme: (defaultTheme) => ({
    ...defaultTheme,
    colors: { ...defaultTheme.colors, ...parsedColors },
  }),
})
```

#### UnoCSS Theme API (What We Use)

**`theme` object in config:**
```typescript
createGenerator({
  presets: [presetWind4()],
  theme: {
    colors: {
      primary: '#3490dc',
      brand: {
        DEFAULT: '#942192',
        light: '#B74BC9',
      },
    },
    spacing: {
      '18': '4.5rem',
    },
    font: {
      display: '"Inter", sans-serif',
    },
    radius: {
      pill: '9999px',
    },
  },
})
```

**`extendTheme` function:**
```typescript
createGenerator({
  presets: [presetWind4()],
  extendTheme: (theme) => {
    // Mutate in place
    theme.colors.primary = '#3490dc'
    // OR return new object
    return { ...theme, colors: { ...theme.colors, custom: '#fff' } }
  },
})
```

The theme object is also available in rule contexts via `({ theme }) => ...`, which means custom rules can reference theme values dynamically.

#### Wind4 Theme Key Mapping (Critical)

Wind4 restructured theme keys from Wind3. The mapping from Tailwind v4 `@theme` variable prefixes to Wind4 theme keys:

| Tailwind v4 `@theme` prefix | UnoCSS Wind4 theme key | Notes |
|------------------------------|----------------------|-------|
| `--color-*` | `colors.*` | Same as Wind3 |
| `--font-*` | `font.*` | Wind3 used `fontFamily` |
| `--text-*` (fontSize) | `text.fontSize.*` | Wind3 used `fontSize` at root |
| `--leading-*` | `text.lineHeight.*` or `leading.*` | Restructured in Wind4 |
| `--tracking-*` | `text.letterSpacing.*` or `tracking.*` | Restructured in Wind4 |
| `--radius-*` | `radius.*` | Wind3 used `borderRadius` |
| `--spacing-*` | `spacing.*` | Unified in Wind4 |
| `--ease-*` | `ease.*` | Wind3 used `easing` |
| `--breakpoint-*` | `breakpoint.*` | Wind3 used `breakpoints` |
| `--shadow-*` | `shadow.*` | Same concept |
| `--animate-*` | `animation.*` | TBD — verify |

**Risk:** This mapping table needs validation against actual Wind4 behavior. Some keys may not produce the expected utility classes. Build a test suite for each prefix early.

---

## Updated Installation

```bash
# Install pnpm (if needed)
npm install -g pnpm

# Core runtime dependencies (unchanged from v1.0)
pnpm add @unocss/core @unocss/preset-wind4 oxc-parser

# CLI dependencies (unchanged)
pnpm add citty consola pathe

# NEW: Readable regex
pnpm add magic-regexp

# Dev dependencies — simplified by vite-plus
pnpm add -D vite-plus typescript

# Remove (replaced by vite-plus):
# tsdown, vitest, @antfu/eslint-config, oxlint, prettier
```

**Note:** `tsdown` and `vitest` are bundled inside `vite-plus` — do NOT install them separately. Installing both will cause version conflicts.

---

## Alternatives Considered (New Additions Only)

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `vite-plus` | Keep separate tsdown + vitest + eslint configs | Config proliferation. vite-plus consolidates 4-5 config files into one. The ecosystem is moving here — adopt now rather than migrate later with more config debt. |
| `vite-plus` | `unbuild` + `vitest` + `eslint` | unbuild is solid but doesn't unify testing/linting. vite-plus gives the full unified experience. |
| `magic-regexp` | Raw `RegExp` literals | Raw regex works but is hard to read, easy to get wrong, and not type-safe. magic-regexp compiles away so there's zero performance cost. For a tool that extracts CSS classes, regex correctness is critical — readability prevents bugs. |
| `magic-regexp` | `verbal-expressions` | verbal-expressions is older, not type-safe, and not compiled-away. magic-regexp is from UnJS (same ecosystem as the rest of our stack). |
| `pnpm` | `npm` | npm works but has no strict isolation (phantom deps possible), slower installs, more disk usage. pnpm is the standard in the VoidZero ecosystem. |
| `pnpm` | `bun` | Bun is fast but its package manager has edge cases with native addons (oxc-parser ships native binaries). pnpm is the safe, standard choice. |
| Custom @theme parser | Wait for preset-wind4 native support | The "Integrate css configuration file" task has been outstanding since April 2025 with no timeline. Vanillify can't wait indefinitely. The custom parser is straightforward (parse CSS custom properties, map to theme keys) and can be replaced if/when UnoCSS adds native support. |
| Custom @theme parser | PostCSS plugin | Adding PostCSS as a dependency for parsing one CSS block is overkill. A simple CSS custom property parser (or even magic-regexp patterns) is sufficient for `@theme` blocks, which have a constrained, well-defined syntax. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Separate `tsdown` devDep** | Bundled inside vite-plus. Installing separately causes version conflicts. | `vp pack` command |
| **Separate `vitest` devDep** | Bundled inside vite-plus. | `vp test` command, import from `'vite-plus/test'` |
| **`@antfu/eslint-config`** | Replaced by Oxlint via vite-plus `lint` block. Oxlint is 50-100x faster. | `vp lint` command |
| **`prettier`** | Replaced by Oxfmt via vite-plus `fmt` block. 99%+ Prettier compatible. | `vp fmt` command |
| **PostCSS / `postcss-custom-properties`** | Overkill for parsing `@theme` blocks. Adds a large dependency tree for a simple task. | Simple CSS parser or magic-regexp patterns for `@theme` extraction |
| **`css-tree` / `csstree`** | Full CSS parser is unnecessary. `@theme` blocks contain only `--variable: value;` pairs — flat key-value parsing. | Custom lightweight parser |
| **`@unocss/preset-wind3` for @theme** | Wind3 targets Tailwind v3 which uses JS config, not CSS `@theme`. It won't help. | UnoCSS programmatic `theme` config |

---

## Version Compatibility (Updated)

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `vite-plus@^0.1.x` | `vite@^8.x`, `vitest@^4.1+` | Alpha but functional. Requires Vite 8+ and Vitest 4.1+. |
| `magic-regexp@^0.11.x` | Any bundler with unplugin support | Transform is optional; works at runtime without it |
| `pnpm@^9.x` | Node.js 20+ | Use Corepack for version pinning |
| `@unocss/core@^66.x` | `@unocss/preset-wind4@^66.x` | Unchanged from v1.0 |
| `oxc-parser@^0.123.x` | Node.js 20+, pnpm (native binaries work) | Unchanged |
| `typescript@^5.5+` | `vite-plus@^0.1.x` | Still needed for `isolatedDeclarations` in pack |

---

## Key Technical Risk: vite-plus Alpha Status

**Confidence: MEDIUM-HIGH**

vite-plus is at version 0.1.15 — clearly alpha/early. However:

- It wraps stable tools (tsdown, vitest, oxlint, oxfmt) — it's a config unifier, not a reimplementation
- The VoidZero team (Evan You) is actively developing it
- The migration path is documented and reversible (you can always split configs back out)
- The QwikDev/cli project (referenced in PROJECT.md) already uses vite-plus patterns

**Mitigation:** If vite-plus has a blocking bug, each tool (tsdown, vitest, oxlint) can be used standalone. The `vite.config.ts` format is designed to be forward-compatible.

---

## Key Technical Risk: @theme Mapping Completeness

**Confidence: MEDIUM**

The mapping from Tailwind v4 `@theme` variable naming to UnoCSS Wind4 theme keys is based on documentation, not runtime verification. Risks:

1. Some theme key mappings may not produce the expected utilities
2. Nested theme values (e.g., `--color-brand-primary`) need correct object nesting
3. Wind4's theme structure differs from Tailwind v4's variable naming in some areas
4. Default theme values (Tailwind v4 ships defaults via `@theme`) need to be handled — vanillify should only process user-defined `@theme` blocks, not Tailwind's internal defaults

**Mitigation:** Build a mapping test suite early. For each `@theme` variable prefix, verify that the corresponding UnoCSS theme key produces the correct utility class CSS.

---

## Sources

- [vite-plus npm](https://www.npmjs.com/package/vite-plus) — version 0.1.15
- [vite-plus GitHub](https://github.com/voidzero-dev/vite-plus) — unified toolchain repo
- [vite-plus Config Docs](https://viteplus.dev/config/) — defineConfig API (pack, lint, fmt, test, staged, run)
- [vite-plus Migration Guide](https://viteplus.dev/guide/migrate) — `vp migrate` command, tool-specific migration steps
- [Announcing Vite+](https://voidzero.dev/posts/announcing-vite-plus) — ecosystem context
- [magic-regexp npm](https://www.npmjs.com/package/magic-regexp) — version 0.11.0
- [magic-regexp Docs](https://regexp.dev/) — API reference, usage guide
- [magic-regexp GitHub](https://github.com/unjs/magic-regexp) — UnJS ecosystem
- [magic-regexp Usage Guide](https://regexp.dev/guide/usage) — createRegExp, helpers, chaining API
- [UnoCSS Theme Config](https://unocss.dev/config/theme) — `theme` object, `extendTheme` API
- [UnoCSS preset-wind4 Docs](https://unocss.dev/presets/wind4) — theme key structure, Wind4-specific changes
- [UnoCSS Issue #4411](https://github.com/unocss/unocss/issues/4411) — Tailwind 4 Support Plan, "Integrate css configuration file" still outstanding
- [Tailwind v4 Theme Variables](https://tailwindcss.com/docs/theme) — `@theme` block syntax, variable naming conventions
- [pnpm Migration](https://pnpm.io/cli/import) — `pnpm import` from package-lock.json

---

*Stack research for: vanillify v1.1 — vite-plus, magic-regexp, pnpm, @theme support*
*Researched: 2026-04-05*
