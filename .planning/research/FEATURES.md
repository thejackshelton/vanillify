# Feature Research

**Domain:** Tailwind CSS to vanilla CSS converter library/CLI — v1.1 milestone features
**Researched:** 2026-04-05
**Confidence:** MEDIUM

---

## Feature Landscape

This document covers only the four v1.1 milestone features. For v1.0 features (already shipped), see git history of this file.

### Table Stakes (Users Expect These)

Features that are baseline expectations for a modern library in the vite+ ecosystem, 2026.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Tailwind v4 `@theme` block support | Any converter claiming Tailwind v4 support that cannot resolve theme-defined classes (e.g., `bg-brand` from `--color-brand`) is incomplete — real projects use `@theme` | HIGH | Core feature of this milestone; approach must bridge Tailwind v4's `@theme` CSS syntax with UnoCSS's `theme` config object |
| pnpm as package manager | pnpm is the standard for libraries in the vite+/UnJS ecosystem (citty, consola, tsdown, UnoCSS all use pnpm) — npm looks out-of-place | LOW | Straightforward migration; `pnpm import` converts lockfile |

### Differentiators (Competitive Advantage)

Features that set vanillify apart from existing converters and demonstrate ecosystem alignment.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| vite-plus unified `defineConfig` | Single `vite.config.ts` replaces `tsdown.config.ts` + `vitest.config.ts` — signals vanillify is a first-class vite+ ecosystem project; reduces config surface for contributors | MEDIUM | vite-plus is alpha (v0.1.15, March 2026). The `pack` block takes tsdown options; `test` block takes vitest options. Replaces two config files with one |
| magic-regexp for all regex patterns | Type-safe, readable regex that compiles away at build time — eliminates the regex DoS concern (MAX_INPUT_LENGTH guard in variant parser) and makes patterns self-documenting | MEDIUM | 6 regex patterns in codebase to replace. UnJS ecosystem alignment (magic-regexp is from the same ecosystem as citty, consola, pathe) |
| Theme-aware class resolution | No existing Tailwind-to-CSS converter handles `@theme`-defined classes. Users writing `@theme { --color-brand: #3ab7bf; }` and using `bg-brand` get zero output from all current tools including vanillify v1.0 | HIGH | This is the hardest feature; requires parsing `@theme` CSS, mapping namespaces to UnoCSS theme config, and passing to `createGenerator` |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full `@theme` namespace parity with Tailwind v4 | Users want every namespace (`--animate-*`, `--perspective-*`, `--ease-*`, `--blur-*`, etc.) | UnoCSS preset-wind4 does not map 1:1 with Tailwind v4 theme namespaces — key names differ (e.g., `fontFamily` vs `font`, `borderRadius` vs `radius`). Attempting full parity creates a maintenance burden tracking two moving targets | Support the high-usage namespaces (`--color-*`, `--spacing-*`, `--font-*`, `--breakpoint-*`, `--radius-*`, `--shadow-*`) in v1.1. Add remaining namespaces based on user demand |
| `@theme inline` and `@theme { --*: initial }` support | Power users want theme resets and inline references | These are Tailwind v4-specific directives that have no equivalent in UnoCSS's theme system. `--*: initial` resets all defaults, which would require reconstructing the entire UnoCSS default theme — extremely fragile | Document as unsupported in v1.1. Users can pass a complete theme override via the API if they need full reset |
| Auto-detection of `@theme` from project CSS files | Users want vanillify to find and read their CSS `@theme` blocks automatically | File system scanning adds complexity, opinions about project structure, and makes the API impure. The current design is explicitly stateless (no file I/O in the library) | Accept `@theme` CSS as a string option (same pattern as `customVariants: string`); CLI handles file reading |
| Workspaces/monorepo support for pnpm | Some users expect workspace tooling | vanillify is a single-package library, not a monorepo. Adding workspace config adds complexity with no benefit | Keep `pnpm` as a single-package manager. If vanillify becomes multi-package later, add workspace config then |
| vite-plus `lint`/`fmt` integration | Users might expect linting and formatting via `vp check` | Adopting oxlint/oxfmt means dropping `@antfu/eslint-config` or running both, creating confusion. The linting ecosystem is still fragmented (oxlint vs eslint). Alpha-quality oxfmt may have formatting inconsistencies | Defer `lint` and `fmt` blocks in vite.config.ts. Keep existing eslint setup. Revisit when vite-plus exits alpha |

---

## Detailed Feature Specifications

### 1. vite-plus `defineConfig` — Unified Config

**What it replaces:**
- `tsdown.config.ts` (4 options: entry, format, dts, clean)
- `vitest.config.ts` (3 options: environment, include pattern)
- Two separate `defineConfig` imports from different packages

**What the unified config looks like:**

```typescript
// vite.config.ts (replaces both tsdown.config.ts and vitest.config.ts)
import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: ['./src/index.ts', './src/cli.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
})
```

**Available config blocks in vite-plus:**

| Block | Tool | Vanillify Needs |
|-------|------|-----------------|
| `pack` | tsdown | YES — library bundling |
| `test` | vitest | YES — unit tests |
| `lint` | oxlint | NO (defer — keep eslint) |
| `fmt` | oxfmt | NO (defer — alpha quality) |
| `run` | vite task | NO (no dev server) |
| `staged` | lint-staged replacement | MAYBE (nice to have) |
| `server` | vite dev | NO (library, not app) |
| `build` | vite build | NO (using pack instead) |

**Migration steps:**
1. `npm install vite-plus` (replaces separate tsdown + vitest dev deps)
2. Create `vite.config.ts` with `pack` and `test` blocks
3. Delete `tsdown.config.ts` and `vitest.config.ts`
4. Update imports in test files: `from 'vitest'` to `from 'vite-plus/test'`
5. Update `package.json` scripts: `tsdown` to `vp pack`, `vitest run` to `vp test`

**Risk:** vite-plus is alpha (v0.1.15). The `pack` block is a thin pass-through to tsdown, so the actual bundling behavior is stable. Test config is vitest under the hood. The risk is in breaking changes to the vite-plus config surface, not the underlying tools.

**Confidence:** MEDIUM — pack/test blocks are documented and working. Lint/fmt blocks are alpha-quality.

### 2. magic-regexp — Type-Safe Regex Replacement

**Current regex patterns in vanillify (6 total):**

| Location | Current Pattern | Purpose |
|----------|----------------|---------|
| `variants/parser.ts:7` | `/@custom-variant\s+([\w-]+)\s+\(([^)]+)\)\s*;/g` | Parse `@custom-variant name (selector);` directives |
| `variants/parser.ts:34` | `/^[\w-]+$/` | Validate variant name (no CSS special chars) |
| `pipeline/extractor.ts:33,79,93` | `/\s+/` (3 uses) | Split class strings on whitespace |
| `pipeline/rewriter.ts:98` | `/[.*+?^${}()\|[\]\\]/g` | Escape string for use in regex |
| `pipeline/rewriter.ts:108` | `/([[\]#()/:,.%@!])/g` | Escape UnoCSS CSS selector special chars |
| `pipeline/rewriter.ts:146` | `escapeRegex('.') + '[a-zA-Z0-9-]+\\\\:' + escaped` | Match variant-prefixed selectors |
| `pipeline/generator.ts:52` | `/@layer\s+[\w-]+\s*\{/g` | Match `@layer` wrappers in UnoCSS output |
| `cli.ts:65` | `/\.(tsx?\|jsx?)$/` (2 uses) | Match file extensions |

**What magic-regexp replacements look like:**

```typescript
// BEFORE (variants/parser.ts)
const SHORTHAND_RE = /@custom-variant\s+([\w-]+)\s+\(([^)]+)\)\s*;/g

// AFTER (magic-regexp)
import { createRegExp, exactly, oneOrMore, anyOf, charIn, charNotIn, whitespace } from 'magic-regexp'

const SHORTHAND_RE = createRegExp(
  exactly('@custom-variant'),
  oneOrMore(whitespace),
  oneOrMore(anyOf(charIn('a-zA-Z0-9_-'))).groupedAs('name'),
  oneOrMore(whitespace),
  exactly('('),
  oneOrMore(charNotIn(')')).groupedAs('selector'),
  exactly(')'),
  whitespace.times.any(),
  exactly(';'),
  ['g']
)
```

```typescript
// BEFORE (pipeline/generator.ts)
const regex = /@layer\s+[\w-]+\s*\{/g

// AFTER
const LAYER_RE = createRegExp(
  exactly('@layer'),
  oneOrMore(whitespace),
  oneOrMore(anyOf(charIn('a-zA-Z0-9_-'))),
  whitespace.times.any(),
  exactly('{'),
  ['g']
)
```

**Benefits for vanillify:**
- The `MAX_INPUT_LENGTH = 10000` guard against regex DoS (line 4 of `variants/parser.ts`) becomes unnecessary — magic-regexp compiles to safe, non-backtracking patterns
- Named capture groups (`groupedAs('name')`) give typed access to matches instead of `match[1]`, `match[2]`
- Patterns are self-documenting — no comments needed to explain what the regex does
- Build-time compilation means zero runtime overhead (same as hand-written regex)

**Patterns NOT worth converting:**
- `/\s+/` (whitespace split) — too simple to benefit from magic-regexp. `string.split(/\s+/)` is idiomatic and universally understood
- Simple string `.includes()` checks — not regex at all

**Confidence:** HIGH — magic-regexp v0.11.0 is stable with 1.2M weekly downloads. UnJS ecosystem, same as citty/consola/pathe.

### 3. Tailwind v4 `@theme` Block Support

**What `@theme` blocks look like (Tailwind v4 CSS syntax):**

```css
@import "tailwindcss";

@theme {
  --color-brand: #3ab7bf;
  --color-brand-dark: #2a8a94;
  --color-surface: oklch(0.97 0.01 250);
  --spacing-18: 4.5rem;
  --font-heading: 'Inter', sans-serif;
  --breakpoint-3xl: 120rem;
  --radius-pill: 9999px;
  --shadow-glow: 0 0 10px rgba(58, 183, 191, 0.5);
}
```

**What classes this generates (Tailwind v4 behavior):**

| `@theme` Variable | Available Utility Classes |
|-------------------|--------------------------|
| `--color-brand: #3ab7bf` | `bg-brand`, `text-brand`, `border-brand`, `fill-brand`, `ring-brand`, `outline-brand`, `decoration-brand`, `shadow-brand`, `accent-brand`, `caret-brand`, `divide-brand`, `placeholder-brand` |
| `--color-brand-dark: #2a8a94` | `bg-brand-dark`, `text-brand-dark`, etc. |
| `--spacing-18: 4.5rem` | `p-18`, `m-18`, `gap-18`, `w-18`, `h-18`, `top-18`, `left-18`, etc. |
| `--font-heading: 'Inter', sans-serif` | `font-heading` |
| `--breakpoint-3xl: 120rem` | `3xl:` responsive prefix |
| `--radius-pill: 9999px` | `rounded-pill` |
| `--shadow-glow: 0 0 10px ...` | `shadow-glow` |

**What CSS gets generated for `bg-brand`:**

```css
.bg-brand {
  background-color: var(--color-brand);
}
/* When --color-brand is defined in @theme, the actual value is also emitted as a CSS variable at :root */
```

**How to bridge `@theme` to UnoCSS `createGenerator`:**

Tailwind v4's `@theme` namespace convention maps to UnoCSS's theme config like this:

| Tailwind v4 `@theme` Namespace | UnoCSS Theme Key (preset-wind4) | Notes |
|---------------------------------|---------------------------------|-------|
| `--color-*` | `colors.*` | Direct mapping. `--color-brand: #3ab7bf` becomes `colors: { brand: '#3ab7bf' }` |
| `--spacing-*` | `spacing.*` | `--spacing-18: 4.5rem` becomes `spacing: { '18': '4.5rem' }` |
| `--font-*` | `font.*` (NOT `fontFamily`) | Wind4 renamed `fontFamily` to `font`. `--font-heading` becomes `font: { heading: "'Inter', sans-serif" }` |
| `--breakpoint-*` | `breakpoints.*` | `--breakpoint-3xl: 120rem` becomes `breakpoints: { '3xl': '120rem' }` |
| `--radius-*` | `radius.*` | Wind4 renamed `borderRadius` to `radius` |
| `--shadow-*` | `boxShadow.*` | May need verification — Wind4 may use `shadow` instead |
| `--text-*` | `text.*` (fontSize moved here in Wind4) | Needs careful testing |

**Implementation approach for vanillify:**

1. Parse the `@theme` CSS block to extract variable declarations (new parser function, similar to `parseCustomVariantCSS`)
2. Map `--namespace-name: value` to UnoCSS theme config object using namespace mapping table above
3. Pass the theme config to `createGenerator` alongside preset-wind4:

```typescript
const generator = await createGenerator({
  presets: [presetWind4()],
  theme: {
    colors: { brand: '#3ab7bf', 'brand-dark': '#2a8a94' },
    spacing: { '18': '4.5rem' },
    font: { heading: "'Inter', sans-serif" },
  },
  ...(customVariants?.length ? { variants: customVariants } : {}),
})
```

4. The `convert()` API accepts a new option: `theme: string` (CSS containing `@theme` block) alongside existing `customVariants: string`
5. CLI accepts `--theme <file>` flag pointing to the CSS file with `@theme` definitions

**Critical risk:** UnoCSS preset-wind4's theme key names may not match Tailwind v4 exactly. The docs state: "The generated key names may not be exactly the same as Tailwind 4." This means the namespace mapping table above needs empirical validation — run actual `createGenerator` calls with theme overrides and verify the correct utilities are generated.

**Nested color keys:** Tailwind v4 supports `--color-brand-dark` which flattens to a single key. UnoCSS themes support nested objects: `colors: { brand: { dark: '#2a8a94', DEFAULT: '#3ab7bf' } }`. The parser needs to decide: flat keys (`'brand-dark': '#2a8a94'`) or nested objects? Start with flat keys — UnoCSS supports both and flat is simpler to implement.

**What NOT to support in v1.1:**
- `@theme { --*: initial }` (full theme reset) — would require knowing UnoCSS's complete default theme to remove
- `@theme inline { ... }` — UnoCSS has no equivalent concept
- `@keyframes` inside `@theme` — UnoCSS handles animations differently
- CSS `var()` references inside `@theme` values — would require resolution context not available statically

**Confidence:** MEDIUM — The approach is sound (parse CSS, map to theme config, pass to createGenerator), but the exact namespace mappings need empirical validation against preset-wind4.

### 4. pnpm Migration

**Current state:** npm with `package-lock.json` (assumed), `node_modules/`

**Migration steps:**

```bash
# 1. Install pnpm globally (if not already)
npm install -g pnpm

# 2. Import existing lockfile
pnpm import  # Creates pnpm-lock.yaml from package-lock.json

# 3. Remove npm artifacts
rm -rf node_modules package-lock.json

# 4. Install with pnpm
pnpm install
```

**Package.json script changes:**

```json
{
  "scripts": {
    "build": "vp pack",       // was: "tsdown" (changes with vite-plus too)
    "test": "vp test",         // was: "vitest run"
    "test:watch": "vp test --watch",
    "typecheck": "tsc --noEmit"
  }
}
```

**What stays the same:**
- `dependencies` and `devDependencies` in package.json — identical
- `engines`, `files`, `exports` — all identical
- All source code — zero changes

**What changes:**
- `package-lock.json` replaced by `pnpm-lock.yaml`
- `node_modules` layout becomes content-addressable (symlinked from global store)
- CI commands change from `npm ci` to `pnpm install --frozen-lockfile`

**pnpm strict mode consideration:** pnpm's default strict mode means packages can only import dependencies they explicitly declare. Vanillify's dependencies are all properly declared in `package.json`, so no issues expected. If a transitive dependency was accidentally used directly, it would surface as an error — which is actually a benefit (catches implicit deps).

**Confidence:** HIGH — pnpm migration for a single-package library is well-documented and low-risk.

---

## Feature Dependencies

```
[vite-plus defineConfig]
    └──requires──> [pnpm migration] (vite-plus docs recommend pnpm; vp commands expect pnpm)
    └──replaces──> [tsdown.config.ts]
    └──replaces──> [vitest.config.ts]

[magic-regexp]
    └──independent (can be done in any order)
    └──touches──> [variants/parser.ts] (SHORTHAND_RE, variant name validation)
    └──touches──> [pipeline/rewriter.ts] (escapeRegex, buildSelectorPattern, variant prefix matching)
    └──touches──> [pipeline/generator.ts] (@layer regex)
    └──touches──> [cli.ts] (file extension matching)

[@theme support]
    └──requires──> [pipeline/generator.ts] (extends getGenerator to accept theme config)
    └──requires──> [new: theme/parser.ts] (parse @theme CSS blocks)
    └──requires──> [new: theme/mapper.ts] (map CSS namespaces to UnoCSS theme keys)
    └──enhances──> [convert() API] (new `theme` option)
    └──enhances──> [CLI] (new `--theme` flag)

[pnpm migration]
    └──independent (foundational; do first)

[@theme support] ──can coexist with──> [custom variant resolution]
    (both pass config to createGenerator; theme goes in `theme:`, variants go in `variants:`)
```

### Dependency Notes

- **vite-plus benefits from pnpm first:** The vite-plus migration guide uses `vp install` which expects pnpm. Doing pnpm first means the vite-plus migration is smoother.
- **magic-regexp is independent:** Touches many files but has no dependency on other features. Can be done in parallel or in any phase.
- **@theme support extends existing architecture:** The `getGenerator` function already accepts `customVariants`. Adding `theme` config follows the same pattern — new option on the same function.
- **@theme and custom variants coexist:** Both are config options to `createGenerator`. No conflict — theme defines what classes exist, variants define how they transform.

---

## v1.1 Milestone Definition

### Must Ship (v1.1)

- [x] **pnpm migration** — foundational toolchain alignment, LOW risk
- [ ] **vite-plus unified config** — replaces two config files, signals ecosystem alignment
- [ ] **Tailwind v4 `@theme` support (core namespaces)** — `--color-*`, `--spacing-*`, `--font-*`, `--breakpoint-*`, `--radius-*`, `--shadow-*`
- [ ] **magic-regexp for variant parser + rewriter** — the complex patterns benefit most

### Stretch Goals (v1.1 if time)

- [ ] **magic-regexp for all remaining patterns** — generator.ts @layer regex, cli.ts extension matching
- [ ] **`@theme` support for additional namespaces** — `--text-*`, `--leading-*`, `--tracking-*`, `--ease-*`, `--blur-*`

### Explicitly Deferred (v1.2+)

- [ ] **`@theme { --*: initial }` (theme reset)** — requires full default theme knowledge
- [ ] **`@theme inline { ... }`** — no UnoCSS equivalent
- [ ] **`@keyframes` inside `@theme`** — different UnoCSS mechanism
- [ ] **vite-plus `lint`/`fmt` blocks** — wait for vite-plus to exit alpha
- [ ] **Automatic `@theme` discovery from project CSS** — breaks stateless API design

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Risk | Priority |
|---------|------------|---------------------|------|----------|
| pnpm migration | MEDIUM | LOW | LOW | P1 |
| vite-plus defineConfig | MEDIUM | LOW | MEDIUM (alpha) | P1 |
| @theme core namespaces | HIGH | HIGH | MEDIUM (mapping validation) | P1 |
| magic-regexp (complex patterns) | LOW | MEDIUM | LOW | P1 |
| magic-regexp (simple patterns) | LOW | LOW | LOW | P2 |
| @theme additional namespaces | MEDIUM | MEDIUM | MEDIUM | P2 |
| vite-plus lint/fmt | LOW | LOW | HIGH (alpha quality) | P3 |
| @theme reset/inline | LOW | HIGH | HIGH | P3 |

**Priority key:**
- P1: Must ship in v1.1
- P2: Ship if time allows in v1.1
- P3: Defer to future milestone

---

## Sources

- [vite-plus GitHub](https://github.com/voidzero-dev/vite-plus) — unified toolchain, MIT license, alpha since March 2026
- [vite-plus config docs](https://viteplus.dev/config/) — pack, test, lint, fmt, run, staged blocks
- [vite-plus migration guide](https://viteplus.dev/guide/migrate) — step-by-step tsdown/vitest consolidation
- [Announcing Vite+ Alpha](https://voidzero.dev/posts/announcing-vite-plus-alpha) — v0.1.15, active development
- [magic-regexp GitHub](https://github.com/unjs/magic-regexp) — compiled-away regex, v0.11.0, 1.2M weekly downloads
- [magic-regexp usage docs](https://regexp.dev/guide/usage) — createRegExp, exactly, anyOf, oneOrMore, char, groupedAs API
- [Tailwind CSS v4 @theme docs](https://tailwindcss.com/docs/theme) — all namespaces, utility generation, CSS variable output
- [UnoCSS preset-wind4 docs](https://unocss.dev/presets/wind4) — theme key renames (fontFamily to font, borderRadius to radius)
- [UnoCSS theme config](https://unocss.dev/config/theme) — `createGenerator` theme option, extendTheme, color objects
- [pnpm import command](https://pnpm.io/cli/import) — lockfile conversion from npm
- [pnpm migration guide (shramko.dev)](https://shramko.dev/blog/pnpm) — step-by-step npm to pnpm

---

*Feature research for: Vanillify v1.1 — Toolchain & Theme Support milestone*
*Researched: 2026-04-05*
