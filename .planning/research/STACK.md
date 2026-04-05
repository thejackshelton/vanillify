# Technology Stack: Tailwind compile() Migration

**Project:** Vanillify v2.0 Engine Swap
**Researched:** 2026-04-05
**Scope:** Engine swap only. oxc-parser, citty, consola, tsdown, vitest are KEEPING -- not re-researched.

## Recommended Stack Changes

### ADD: Tailwind CSS (the engine replacement)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `tailwindcss` | `4.2.2` | CSS generation engine via `compile().build()` | The bare `tailwindcss` package exports `compile()` directly. It accepts a CSS string + optional `loadStylesheet`/`loadModule` callbacks, returning a compiler with `build(candidates: string[]): string`. This is a pure async function with no filesystem side effects when you provide your own loaders. Zero peer dependencies. Verified working 2026-04-05. |

### REMOVE: UnoCSS packages

| Package | Current Version | Why Remove |
|---------|----------------|------------|
| `@unocss/core` | `^66.6.7` | Replaced by `tailwindcss` `compile()`. The `createGenerator` approach was a workaround for Tailwind lacking a programmatic API. Tailwind v4 now has one. |
| `@unocss/preset-wind4` | `^66.6.7` | No longer needed. Was providing Tailwind v4 utility rules to UnoCSS. Native Tailwind handles its own utilities. |

### REMOVE: Custom translation layer dependencies (candidates)

| Package | Current Version | Why Remove |
|---------|----------------|------------|
| `magic-regexp` | `^0.11.0` | Used in variant parsing (`src/variants/parser.ts`), custom variant resolution, and some extraction code. The entire `src/variants/` and `src/theme/` directories are being deleted since Tailwind handles `@custom-variant` and `@theme` natively. Evaluate during migration whether any remaining uses in `extractor.ts`, `rewriter.ts`, or `generator.ts` can be replaced with simple regex or removed entirely. |

### KEEP: Everything else

| Package | Version | Role | Notes |
|---------|---------|------|-------|
| `oxc-parser` | `^0.123.0` | AST-based class extraction | Unchanged. Still the best JSX/TSX parser. |
| `oxc-walker` | `^0.7.0` | AST traversal | Unchanged. Pairs with oxc-parser. |
| `citty` | `^0.2.2` | CLI argument parsing | Unchanged. |
| `consola` | `^3.4.2` | Terminal output | Unchanged. |
| `pathe` | `^2.0.3` | Cross-platform paths | Unchanged. |
| `tinyglobby` | `^0.2.15` | Glob expansion for CLI | Unchanged. |

## The `tailwindcss` vs `@tailwindcss/node` Decision

**Use `tailwindcss` (bare package). Do NOT use `@tailwindcss/node`.**

### Why bare `tailwindcss`

The bare `tailwindcss` package (v4.2.2) exports `compile()` with optional `loadStylesheet` and `loadModule` callbacks. This is the right choice because:

1. **No filesystem coupling.** The bare package lets vanillify provide its own `loadStylesheet` callback. The CSS input string (including `@import "tailwindcss"`, `@theme`, `@custom-variant`) is passed directly to `compile()`. No temp files, no directory scanning, no implicit behavior.

2. **Zero dependencies.** The `tailwindcss` package has NO runtime dependencies. It ships self-contained with Lightning CSS bundled in. Compare to `@tailwindcss/node` which pulls in `jiti`, `enhanced-resolve`, `lightningcss` (separate), `magic-string`, `source-map-js`, and `@jridgewell/remapping`.

3. **Stable public API.** The `compile` and `compileAst` functions are the documented public exports (along with `__unstable__loadDesignSystem`, plugin helpers, and CSS entry points). The `@tailwindcss/node` package is an internal implementation detail of the CLI and Vite plugin -- its `CompileOptions` has a different shape (required `base`, required `onDependency`) and could change without notice.

### `@tailwindcss/node` CompileOptions vs `tailwindcss` CompileOptions

```typescript
// tailwindcss (bare) -- all optional
type CompileOptions = {
  base?: string;
  from?: string;
  polyfills?: Polyfills;
  loadModule?: (id: string, base: string, resourceHint: 'plugin' | 'config') => Promise<{
    path: string; base: string; module: Plugin | Config;
  }>;
  loadStylesheet?: (id: string, base: string) => Promise<{
    path: string; base: string; content: string;
  }>;
};

// @tailwindcss/node -- base and onDependency required, has filesystem resolvers
interface CompileOptions {
  base: string;                    // REQUIRED
  from?: string;
  onDependency: (path: string) => void;  // REQUIRED
  shouldRewriteUrls?: boolean;
  polyfills?: Polyfills;
  customCssResolver?: Resolver;
  customJsResolver?: Resolver;
}
```

The bare package is clearly designed for programmatic use. The `@tailwindcss/node` package is designed for build tools that operate on the filesystem.

## Compile API Details

### Function Signature (verified from `tailwindcss@4.2.2` type definitions)

```typescript
import { compile } from 'tailwindcss';

const compiler = await compile(css: string, opts?: CompileOptions);
// Returns:
// {
//   sources: { base: string; pattern: string; negated: boolean }[];
//   root: null | 'none' | { base: string; pattern: string };
//   features: Features;
//   build(candidates: string[]): string;
//   buildSourceMap(): DecodedSourceMap;
// }
```

### The `loadStylesheet` Callback

When the CSS input contains `@import "tailwindcss"`, the engine calls `loadStylesheet("tailwindcss", base)`. Vanillify must resolve this to the actual CSS file inside `node_modules/tailwindcss/index.css`.

Minimal implementation:

```typescript
import { compile } from 'tailwindcss';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const loadStylesheet = async (id: string, base: string) => {
  const resolvedPath = id.startsWith('.') || id.startsWith('/')
    ? resolve(base, id)
    : require.resolve(id.endsWith('.css') ? id : id + '/index.css');
  const content = readFileSync(resolvedPath, 'utf-8');
  return { path: resolvedPath, base: dirname(resolvedPath), content };
};
```

**Note:** The `loadStylesheet` callback is recursive -- Tailwind's `index.css` itself imports `./theme.css`, `./preflight.css`, and `./utilities.css` via relative paths. The callback handles those via the `id.startsWith('.')` branch.

### The `loadModule` Callback

Only needed if users provide JS plugins or config files via `@plugin` or `@config` directives in their CSS. For vanillify v2.0, this is NOT needed initially. The engine swap focuses on `@import`, `@theme`, `@custom-variant`, and utility generation.

If needed later, signature is:
```typescript
loadModule: async (id: string, base: string, resourceHint: 'plugin' | 'config') => {
  // Resolve and dynamically import the module
  return { path: resolvedPath, base: dirname(resolvedPath), module: importedModule };
}
```

### `source(none)` Directive

**Critical for vanillify's use case.** Adding `source(none)` to the import disables Tailwind's automatic filesystem scanning for class names:

```css
@import "tailwindcss" source(none);
```

Without this, Tailwind would try to scan the project directory for files containing class names. Vanillify already extracts class names via oxc-parser -- it passes them directly to `build()`. The `source(none)` directive tells Tailwind: "I will give you the candidates, do not scan anything."

**Must be applied to each import if using split imports:**
```css
@import "tailwindcss/theme" source(none);
@import "tailwindcss/preflight" source(none);
@import "tailwindcss/utilities" source(none);
```

## CSS Input Patterns for Vanillify

### Default (full Tailwind with user theme/variants)

```css
@import "tailwindcss" source(none);

/* User's @theme block (if provided) */
@theme {
  --color-brand: #ff6600;
}

/* User's @custom-variant definitions (if provided) */
@custom-variant ui-checked (&[data-checked]);
```

### Utilities-only (no preflight, no base styles)

```css
@import "tailwindcss/theme" source(none);
@import "tailwindcss/utilities" source(none);
```

**Note:** The theme import is required even for utilities-only mode because color utilities like `bg-red-500` resolve to `var(--color-red-500)` which is defined in the theme layer. Without theme, only non-theme-dependent utilities like `flex` and `hidden` work.

## Verified Behavior (tested 2026-04-05 against tailwindcss@4.2.2)

| Feature | Works? | Confidence | Notes |
|---------|--------|------------|-------|
| `compile().build(candidates)` | YES | HIGH | Tested: returns CSS string for given class names |
| `source(none)` disables scanning | YES | HIGH | No filesystem access when `source(none)` is used |
| `@theme` blocks | YES | HIGH | Custom theme values appear in `:root, :host` and utilities resolve them |
| `@custom-variant` | YES | HIGH | `@custom-variant ui-checked (&[data-checked])` produces correct `&[data-checked]` selectors |
| Responsive variants (`sm:`, `md:`) | YES | HIGH | Produces `@media (width >= 40rem)` etc. |
| State variants (`hover:`, `focus:`) | YES | HIGH | Produces `&:hover { @media (hover: hover) { ... } }` |
| `dark:` variant | YES | HIGH | Produces `@media (prefers-color-scheme: dark)` |
| Arbitrary values (`bg-[#ff0000]`) | NOT TESTED | MEDIUM | Expected to work -- native Tailwind feature |
| CSS nesting in output | YES | HIGH | Output uses native CSS nesting (`&:hover { ... }`) rather than flat selectors |
| Theme-only variables in output | YES | HIGH | Only theme variables actually used by requested candidates appear in `:root` |

## CSS Output Differences from UnoCSS

The Tailwind compile output differs from UnoCSS output in ways that affect vanillify:

1. **CSS nesting.** Tailwind v4 outputs native CSS nesting (`.hover\:text-white { &:hover { ... } }`). UnoCSS outputs flat selectors (`.hover\:text-white:hover { ... }`). This is a **breaking change in output format** but is valid modern CSS.

2. **Theme variables.** Tailwind outputs `var(--color-red-500)` referencing theme CSS custom properties. UnoCSS with preset-wind4 may inline or reference differently. The theme layer in output now includes a `:root, :host { }` block with only the variables used by requested candidates.

3. **Layer structure.** Output is wrapped in `@layer theme, base, components, utilities;` with `@layer utilities { ... }`. UnoCSS output does not use CSS layers by default.

4. **Preflight.** Full `@import "tailwindcss"` includes Tailwind's preflight (reset CSS) in the `@layer base` section. Vanillify may want to strip this or offer an option to exclude it.

## Package Size Impact

| Change | Size Impact |
|--------|-------------|
| Remove `@unocss/core` | -~2.5 MB (node_modules) |
| Remove `@unocss/preset-wind4` | -~1 MB (node_modules) |
| Add `tailwindcss` | +~8 MB (node_modules, includes Lightning CSS WASM/native) |
| Net | +~4.5 MB node_modules, BUT zero additional transitive deps |

The `tailwindcss` package is larger but self-contained. The UnoCSS packages also pull in their own transitive dependencies. The net impact on end users is minimal since this is a build-time tool, not a runtime dependency.

## Version Pinning Strategy

Pin to `~4.2.2` (patch range) initially, not `^4.2.2`:

- The `compile()` API is public but relatively new as a programmatic entry point.
- Minor versions could add features that change output format (new layers, new CSS patterns).
- Vanillify's tests should catch output changes, but a tighter pin reduces surprise.
- Widen to `^4.x` after the migration is stable and tests confirm compatibility across minors.

## Migration Integration Points

### Generator simplification

Current `src/pipeline/generator.ts` uses:
- `createGenerator` from `@unocss/core` (instantiate)
- `presetWind4` from `@unocss/preset-wind4` (configure)
- `generator.generate(classNames)` (produce CSS)
- Custom variant injection via UnoCSS `variants` config
- Custom theme translation via UnoCSS theme config

New generator (~40-50 lines):
- `compile` from `tailwindcss` (instantiate with CSS string)
- `compiler.build(classNames)` (produce CSS)
- Theme: include `@theme` block in the CSS string (native)
- Variants: include `@custom-variant` directives in the CSS string (native)

### What the generator does NOT need to handle anymore

- Theme key translation (UnoCSS theme format != Tailwind theme format) -- DELETE `src/theme/`
- Custom variant object construction (UnoCSS `VariantObject` API) -- DELETE `src/variants/`
- Preset configuration and matching -- Tailwind IS the preset
- Cache key computation based on theme/variant config -- simplify to CSS string hash

## Installation Commands

```bash
# Add
pnpm add tailwindcss@~4.2.2

# Remove
pnpm remove @unocss/core @unocss/preset-wind4

# Evaluate during migration (may also remove)
# pnpm remove magic-regexp  # if no remaining uses after theme/variant deletion
```

## Sources

- [tailwindcss@4.2.2 npm page](https://www.npmjs.com/package/tailwindcss) -- version, exports field, zero dependencies (verified via `npm view`)
- [@tailwindcss/node@4.2.2 npm page](https://www.npmjs.com/package/@tailwindcss/node) -- dependencies: jiti, enhanced-resolve, lightningcss, magic-string, source-map-js, @jridgewell/remapping (verified via `npm view`)
- [GitHub Discussion #16581: Using Tailwind v4 programmatically](https://github.com/tailwindlabs/tailwindcss/discussions/16581) -- compile() API usage patterns
- [GitHub Discussion #15881: Compiling Tailwind v4 programmatically](https://github.com/tailwindlabs/tailwindcss/discussions/15881) -- PostCSS vs compile() approaches
- [Tailwind CSS Functions and Directives docs](https://tailwindcss.com/docs/functions-and-directives) -- `source(none)`, `@theme`, `@custom-variant` syntax
- [Tailwind CSS Detecting Classes docs](https://tailwindcss.com/docs/detecting-classes-in-source-files) -- `source(none)` directive details
- `tailwindcss@4.2.2` type definitions (`dist/lib.d.mts`) -- compile() signature, CompileOptions, build() return type (read directly from installed package)
- `@tailwindcss/node@4.2.2` type definitions (`dist/index.d.ts`) -- CompileOptions differences (read directly from installed package)
- Local verification tests (2026-04-05) -- compile/build with `source(none)`, `@theme`, `@custom-variant`, responsive/state/dark variants all confirmed working
