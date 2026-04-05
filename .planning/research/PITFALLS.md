# Pitfalls Research

**Domain:** Adding vite-plus migration, magic-regexp adoption, pnpm switch, and @theme support to existing UnoCSS-based library
**Researched:** 2026-04-05
**Confidence:** MEDIUM (vite-plus is alpha; preset-wind4 @theme gap is confirmed)

---

## Critical Pitfalls

### Pitfall 1: preset-wind4 Does Not Support Tailwind v4 @theme CSS Blocks

**What goes wrong:**
Tailwind v4 uses `@theme` blocks in CSS files to define design tokens (colors, spacing, font sizes). UnoCSS's `preset-wind4` does NOT parse CSS `@theme` blocks. It only accepts theme configuration via the JavaScript/TypeScript `theme` key in `createGenerator` config. If vanillify tries to pass `@theme` CSS content to the generator, theme-defined tokens will silently produce no CSS output -- utilities referencing custom theme values (e.g., `bg-brand`, `text-heading`) will appear in the `unmatched` set with no error beyond the existing warning.

**Why it happens:**
UnoCSS's architecture treats theme as a JavaScript config concern, not a CSS-file concern. Tailwind v4 moved theme to CSS (`@theme { --color-brand: #ff0000; }`) but UnoCSS has no CSS config file parser. The GitHub issue #4411 (closed April 2025) does not mention @theme support, and the preset-wind4 docs confirm only JS-based theme configuration.

**How to avoid:**
1. Build a `@theme` block parser in vanillify that extracts CSS custom property definitions from the user's CSS file
2. Map extracted `@theme` tokens to UnoCSS's JavaScript `theme` configuration object
3. Pass the mapped theme into `createGenerator({ presets: [presetWind4()], theme: mappedTheme })`
4. This follows the same pattern as vanillify's existing `@custom-variant` handling -- parse CSS syntax, translate to UnoCSS config

The mapping layer needs to understand Tailwind v4's theme namespace conventions:
- `--color-*` maps to `theme.colors`
- `--spacing-*` maps to `theme.spacing`
- `--font-size-*` maps to `theme.fontSize`
- `--font-family-*` maps to `theme.fontFamily`

**Warning signs:**
- Tests pass for standard utilities but fail for any theme-dependent class
- `unmatched` array grows when processing files from projects with custom themes
- CSS output is empty for classes that reference custom theme tokens

**Phase to address:**
Dedicated phase for @theme support -- do NOT attempt in the same phase as toolchain migration. This is feature work with its own complexity and risk. Must come after vite-plus/pnpm/magic-regexp migration is stable.

---

### Pitfall 2: Generator Cache Invalidation When Theme Config Changes

**What goes wrong:**
The existing `getGenerator()` in `generator.ts` caches generators keyed by variant config identity (sorted variant names). Adding theme support means the cache key must also include theme configuration. If the cache key does not account for theme, a generator created with Theme A will be reused for Theme B, producing incorrect CSS.

**Why it happens:**
The current cache key is `customVariants.map(v => '${v.name}:${v.match}').sort().join(',')` or `'__default__'`. Theme config is not part of this key. When `convert()` starts accepting theme options, the cached generator with the wrong theme will be silently returned.

**How to avoid:**
1. Extend the cache key to include a theme fingerprint: hash or serialize the theme object and append to the variant key
2. Consider using `JSON.stringify(theme)` as part of the key (theme objects should be small and serializable)
3. Add a test that explicitly verifies: create generator with theme A, then theme B, assert different CSS output
4. Keep the `resetGenerator()` function for testing

**Warning signs:**
- Tests pass when run individually but fail when run together (generator from previous test leaks)
- Theme-dependent CSS works on first call but returns wrong values on subsequent calls with different themes

**Phase to address:**
Same phase as @theme support. The cache key change is a prerequisite for theme support, not an afterthought.

---

### Pitfall 3: vite-plus Alpha Instability Breaking the Build Pipeline

**What goes wrong:**
vite-plus was released as alpha on March 13, 2026. The `vp pack` command wraps tsdown, but as alpha software, the wrapper behavior may change between releases. Build output (file names, export map structure, .d.ts generation) could differ from the current tsdown direct output, breaking npm package consumers who depend on the existing `exports` field in package.json.

**Why it happens:**
Alpha software by definition has unstable APIs. The `pack` block in `vite.config.ts` accepts "all tsdown configuration options" according to docs, but the translation layer between vite-plus config and tsdown invocation may have gaps. Entry point handling (`['./src/index.ts', './src/cli.ts']`), dual ESM+CJS output, and .d.ts paths may not map 1:1.

**How to avoid:**
1. Pin vite-plus to an exact version (no caret range) during migration
2. Before removing `tsdown.config.ts`, verify that `vp pack` produces identical output structure:
   - Same file names in `dist/` (index.mjs, index.cjs, index.d.mts, index.d.cts, cli.mjs)
   - Same `exports` field compatibility
   - Same .d.ts content (check for regressions in type generation)
3. Keep `tsdown.config.ts` as a fallback until `vp pack` output is verified
4. Write a build verification test: `npm pack --dry-run` output should list the same files before and after migration
5. Test the package locally with `pnpm link` before publishing

**Warning signs:**
- `vp pack` exits 0 but dist/ has different file structure
- TypeScript consumers report missing types after upgrade
- CJS consumers get "ERR_REQUIRE_ESM" errors
- CLI binary path (`./dist/cli.mjs`) changes or disappears

**Phase to address:**
First phase of milestone. Toolchain migration must be done and verified before any feature work.

---

### Pitfall 4: vite-plus Unified Config Erasing Vitest Customization

**What goes wrong:**
Moving from separate `vitest.config.ts` to the `test` block in `vite.config.ts` can silently drop test configuration. The current vitest config specifies `environment: 'node'` and custom `include` globs (`src/**/*.test.ts`, `test/**/*.test.ts`). If the migration forgets to carry these over, tests may not be found or may run in the wrong environment.

**Why it happens:**
vite-plus defaults may differ from vitest standalone defaults. The `include` pattern in vitest defaults to `['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}']` which is broader than the current explicit `src/**/*.test.ts` and `test/**/*.test.ts`. The `environment` default is `'node'` in vitest but may not be preserved through the vite-plus wrapper.

**How to avoid:**
1. Copy the vitest config verbatim into the `test` block first, then simplify
2. Run `vitest run --reporter=verbose` before AND after migration -- diff the test list
3. Verify test count is identical (currently: extractor.test.ts, generator.test.ts, namer.test.ts, parser.test.ts, rewriter.test.ts in src/pipeline/ + parser.test.ts, resolver.test.ts in src/variants/ + integration tests)
4. Keep `vitest.config.ts` until the unified config is verified, then delete in a separate commit

**Warning signs:**
- Test count drops after migration (some test files not discovered)
- Tests pass but coverage drops (files excluded from test run)
- `vitest run` works but `vp test` does not (command name change)

**Phase to address:**
First phase, same as build migration. Verify tests pass with unified config before proceeding.

---

### Pitfall 5: pnpm Phantom Dependency Exposure

**What goes wrong:**
Switching from npm to pnpm exposes phantom dependencies -- packages that vanillify imports but does not declare in `package.json`. pnpm's strict `node_modules` structure (symlinked, non-flat) means transitive dependencies are NOT hoisted to the top level. If any source file imports a module that is only a transitive dep (e.g., brought in by `@unocss/core` or `oxc-parser`), pnpm will fail at runtime with `ERR_MODULE_NOT_FOUND`.

**Why it happens:**
npm hoists everything to a flat `node_modules`. Developers unknowingly import transitive deps that happen to be available. The current `package.json` declares deps explicitly, but `@unocss/core` brings in sub-packages and `oxc-parser` brings in platform-specific binaries. Any implicit reliance on their internal structure will break.

**How to avoid:**
1. Before migration: run `npx depcheck` to identify undeclared dependencies
2. After `pnpm install`: run the full test suite immediately -- phantom deps will surface as import failures
3. Do NOT use `shamefully-hoist=true` or `node-linker=hoisted` in `.npmrc` -- these defeat the purpose of pnpm
4. If a phantom dep is found, add it explicitly to `package.json` dependencies
5. Check that `oxc-parser` and `oxc-walker` native binary resolution works under pnpm's symlink structure (should work, but verify)

**Warning signs:**
- `pnpm install` succeeds but `pnpm test` fails with module not found
- Build works locally but fails in CI (different resolution behavior)
- Import of `@unocss/core` sub-paths (e.g., internal utilities) fails

**Phase to address:**
First phase. pnpm migration should happen alongside or immediately after vite-plus migration, before any feature work.

---

### Pitfall 6: magic-regexp Cannot Replace Dynamic Runtime Regex Patterns

**What goes wrong:**
The codebase has regex patterns that magic-regexp fundamentally cannot handle:
1. `rewriter.ts` line 216: `new RegExp(pattern + '(?:[:{\\s]|$)')` -- constructed at runtime from CSS class names
2. `rewriter.ts` line 97: `escapeRegex()` -- a meta-pattern for escaping regex special chars
3. `rewriter.ts` line 107: `buildSelectorPattern()` -- runtime CSS escaping fed to `new RegExp()`

magic-regexp is a "compiled-away" library designed for static, compile-time patterns. The `matchesAnyPattern` function builds regex from CSS class names at runtime -- this is fundamentally incompatible with magic-regexp's design. Attempting to force magic-regexp here will result in either type errors, runtime overhead, or incorrect behavior.

**Why it happens:**
The project requirement says "replace all regex with magic-regexp." But magic-regexp was designed for readable, static patterns -- not for programmatic regex construction. The vanillify codebase uses BOTH static patterns (good candidates) AND dynamic patterns (cannot be converted).

**How to avoid:**
1. Audit every regex and categorize: static (convertible) vs dynamic (must stay raw)
2. Static candidates for magic-regexp:
   - `SHORTHAND_RE` in `variants/parser.ts` -- good candidate, well-defined structure
   - `/@layer\s+[\w-]+\s*\{/g` in `generator.ts` -- good candidate
   - Variant name validator `/^[\w-]+$/` in `variants/parser.ts` -- marginal, arguably clearer as raw regex
3. Dynamic patterns that MUST stay as raw regex:
   - All patterns in `matchesAnyPattern` in `rewriter.ts` -- runtime-constructed
   - `buildSelectorPattern` output fed to `new RegExp()` -- runtime
   - `escapeRegex` helper -- meta-pattern, clearer as raw regex
4. Accept a mixed approach: magic-regexp for static patterns, raw regex for dynamic ones
5. Do NOT force 100% magic-regexp adoption -- it will create worse code for dynamic cases

**Warning signs:**
- Trying to wrap `createRegExp()` around runtime-variable patterns and getting type errors
- Build-time transform fails because pattern is not statically analyzable
- Performance regression from magic-regexp runtime on hot paths in rewriter

**Phase to address:**
Second phase, after toolchain migration. Low risk but needs careful audit to avoid over-applying.

---

### Pitfall 7: magic-regexp Transform Not Available in tsdown/vite-plus Library Build

**What goes wrong:**
magic-regexp ships a build-time transform (unplugin) that compiles `createRegExp()` calls to pure `RegExp` literals at build time -- zero runtime overhead. But this transform is designed for Vite/webpack/Nuxt app builds. For a library built with tsdown (or `vp pack`), the transform may not be available or may not integrate cleanly. Without the transform, magic-regexp adds ~1 kB runtime overhead and executes `createRegExp` at call time instead of compile time.

**Why it happens:**
magic-regexp's unplugin targets application bundlers, not library bundlers. tsdown uses Rolldown which has its own plugin system. The magic-regexp unplugin compatibility with Rolldown/tsdown is undocumented.

**How to avoid:**
1. Test whether magic-regexp's unplugin works with tsdown/Rolldown
2. If it does not: accept the ~1 kB runtime cost (minimal for a Node.js library)
3. If runtime overhead matters: define regex patterns as module-level constants (executed once at import, not per call)
4. Alternative: use magic-regexp only in test files for readable assertions, keep raw regex in source

**Warning signs:**
- `vp pack` build output still contains `createRegExp()` calls (transform didn't run)
- Bundle size increases by 1+ kB compared to raw regex version
- Runtime pattern construction is measurably slower on hot paths

**Phase to address:**
Second phase (magic-regexp adoption). Investigate transform compatibility before committing to magic-regexp in source.

---

### Pitfall 8: pnpm Lockfile and CI Cache Invalidation

**What goes wrong:**
Switching from npm to pnpm means replacing `package-lock.json` with `pnpm-lock.yaml`. CI pipelines that cache `node_modules` based on `package-lock.json` hash will miss the cache entirely, causing slow CI runs until updated. If CI scripts still reference `npm ci` or `npm install`, they will create a parallel `package-lock.json` and install with npm's flat resolution, defeating pnpm's strict structure.

**Why it happens:**
CI configuration and lockfile are easy to forget during a package manager migration. The project currently has `package-lock.json` in the root. GitHub Actions and other CI systems often have npm-specific caching built in.

**How to avoid:**
1. Delete `package-lock.json` after generating `pnpm-lock.yaml`
2. Add `packageManager: "pnpm@9.x.x"` field to `package.json` for corepack
3. Update all CI workflows to use `pnpm install --frozen-lockfile`
4. Update CI cache key to hash `pnpm-lock.yaml` instead of `package-lock.json`
5. Use `pnpm/action-setup` or corepack in GitHub Actions
6. Add `package-lock.json` to `.gitignore` to prevent accidental recreation

**Warning signs:**
- CI takes 3-5x longer after migration (cache miss)
- CI creates both `package-lock.json` and `pnpm-lock.yaml`
- `pnpm install --frozen-lockfile` fails in CI (lockfile not committed)

**Phase to address:**
First phase, same commit as pnpm migration. CI must be updated atomically.

---

### Pitfall 9: @theme Token Namespace Mapping is Lossy and Incomplete

**What goes wrong:**
Tailwind v4's `@theme` block uses CSS custom property namespaces (`--color-*`, `--spacing-*`, etc.) that must be mapped to UnoCSS's JavaScript `theme` object structure. This mapping is not 1:1. Tailwind v4 allows arbitrary custom properties in `@theme` that have no UnoCSS equivalent. Additionally, preset-wind4's theme keys differ from preset-wind3 (e.g., `fontFamily` adjustments). If the mapping is incomplete, theme-dependent utilities silently produce no CSS.

**Why it happens:**
Tailwind v4's @theme is a CSS-first configuration system. UnoCSS's theme is a JavaScript-first configuration system. The namespaces evolved independently. Tailwind v4 also supports inline `@theme` values that modify the default theme (e.g., `@theme { --color-primary: oklch(0.7 0.15 200); }`) -- these need to be merged with preset-wind4's default theme, not replace it.

**How to avoid:**
1. Start with a strict subset: `--color-*`, `--spacing-*`, `--font-size-*`, `--font-family-*`, `--breakpoint-*`
2. Log unrecognized `@theme` namespaces as warnings (not errors)
3. Merge parsed theme INTO the preset-wind4 default theme (spread/deep-merge), do not replace it
4. Write tests using Tailwind v4's own default theme values to verify correct mapping
5. Accept that some edge-case @theme properties will not map -- document the supported set

**Warning signs:**
- Custom theme colors work but custom spacing does not (incomplete namespace mapping)
- Default Tailwind utilities break after theme is applied (theme replaced defaults instead of extending)
- `oklch()` color values from @theme are not recognized by UnoCSS

**Phase to address:**
@theme support phase. The namespace mapping is the core of this feature and should be built incrementally with tests for each namespace.

---

### Pitfall 10: Theme + Custom Variant Interaction is Untested Territory

**What goes wrong:**
When a user defines both `@theme { --color-brand: #ff0000; }` and `@custom-variant ui-checked ([ui-checked] &)`, then uses `ui-checked:bg-brand` in their component, vanillify needs to:
1. Parse the @theme block and map `--color-brand` to UnoCSS theme
2. Parse the @custom-variant and translate to UnoCSS variant
3. Pass BOTH to `createGenerator` simultaneously
4. The generator must resolve `bg-brand` (theme-dependent) under `ui-checked` (custom variant)

If either layer is configured incorrectly, or if the generator cache key doesn't account for the combined config, the output will be wrong or empty.

**Why it happens:**
Theme and variants are independent features in vanillify's architecture, but they must compose correctly in the generator. The current generator cache keys by variant config only. Adding theme creates a combinatorial config space that the cache must handle.

**How to avoid:**
1. Build theme support and custom variant support as composable options that feed into a single `createGenerator` call
2. Cache key must be `hash(variants) + hash(theme)` -- not just one
3. Write explicit integration tests for theme + variant composition:
   - `hover:bg-brand` (built-in variant + theme color)
   - `ui-checked:bg-brand` (custom variant + theme color)
   - `md:ui-checked:bg-brand` (responsive + custom variant + theme color)
4. Test the full `convert()` pipeline, not just individual layers

**Warning signs:**
- `bg-brand` works but `hover:bg-brand` produces empty CSS
- Theme and variants work independently but not together
- Stacking a custom variant with a theme-dependent class produces no output

**Phase to address:**
@theme support phase, after individual theme and variant features are working. Composition testing is the integration gate.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using `shamefully-hoist=true` in pnpm | Quick fix for phantom deps | Defeats pnpm's strict resolution, hides real dependency issues | Never -- fix the actual missing dependencies |
| Keeping both `tsdown.config.ts` and `vite.config.ts` `pack` block | Safety net during migration | Two sources of truth for build config, will drift | During migration only -- delete tsdown.config.ts once `vp pack` verified |
| Hardcoding theme token mappings instead of parsing @theme | Faster to implement | Breaks when Tailwind v4 adds new theme namespaces | MVP of theme support only -- must be generalized before v1.2 |
| Skipping magic-regexp for all dynamic regex | Avoids forced awkward code | Inconsistent codebase style (some magic-regexp, some raw) | Permanent -- dynamic regex should stay as raw regex, this is the correct approach |
| Faking @theme support with a lookup table | Covers common cases | Diverges from real Tailwind CSS output (same problem as competitors vanillify exists to solve) | Never -- this is the exact anti-pattern vanillify was built to avoid |
| Accepting magic-regexp runtime without build transform | Simpler setup, no plugin config | 1 kB runtime overhead, patterns constructed at import time | Acceptable for a Node.js library -- measure, don't over-optimize |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| vite-plus + tsdown | Configuring `pack` block but keeping `tsdown.config.ts` -- tsdown may read its own config and ignore vite-plus | Delete `tsdown.config.ts` after verifying `vp pack` output matches. Do not have both config files. |
| vite-plus + vitest | Assuming `vp test` inherits vitest defaults when vitest config was customized | Explicitly copy `environment: 'node'` and `include` patterns into the `test` block of vite.config.ts |
| pnpm + oxc-parser | Assuming native binary resolution works the same as npm | Verify `oxc-parser` and `oxc-walker` native binaries install correctly under pnpm's content-addressable store. Run `parseSync` smoke test after migration. |
| pnpm + CI (GitHub Actions) | Using `npm ci` or `npm install` in CI scripts after switching to pnpm | Update CI to `pnpm install --frozen-lockfile`. Add `packageManager` field in package.json for corepack. |
| magic-regexp + tsdown/rolldown | Expecting the compile-away transform to work without explicit plugin setup | The magic-regexp transform is a build plugin (Vite/webpack/Nuxt). For tsdown: either (a) use the runtime (1 kB), or (b) investigate unplugin compatibility with Rolldown. Verify before committing. |
| @theme parser + generator cache | Parsing @theme and passing to `createGenerator` without updating cache key | Hash the theme config and include in cache key alongside variant hash. Test with multiple themes in sequence. |
| preset-wind4 theme + custom variants | Assuming theme tokens and custom variants compose automatically | They interact when a variant-prefixed class references a theme token (`hover:bg-brand`). Test this combination explicitly -- it requires both theme and variant config to be present in the same generator. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Creating new `createGenerator` per theme config without caching | `convert()` latency jumps from ~10ms to ~100ms+ | Cache generators by theme+variant composite key | When processing files from multiple theme contexts in sequence |
| magic-regexp runtime on hot path (rewriter `matchesAnyPattern`) | Measurable slowdown in conversion of files with many class names | Keep `matchesAnyPattern` as raw regex -- magic-regexp is for static patterns only | Files with 50+ unique class names |
| Parsing @theme CSS on every `convert()` call | Redundant work if theme CSS hasn't changed | Parse @theme once, pass resulting config to all `convert()` calls. Let the caller cache the theme parse result. | Batch processing of many files with same theme |
| pnpm install in CI without store cache | CI time doubles compared to npm with node_modules cache | Configure pnpm store cache in GitHub Actions (`pnpm/action-setup` with cache) | Every CI run without cache |

## "Looks Done But Isn't" Checklist

- [ ] **vite-plus migration:** `vp pack` runs without error -- verify dist/ file structure matches previous tsdown output (index.mjs, index.cjs, index.d.mts, index.d.cts, cli.mjs)
- [ ] **vite-plus migration:** `vp test` discovers all test files -- compare test count before/after, not just pass/fail
- [ ] **vite-plus migration:** package.json `scripts` updated from `tsdown`/`vitest run` to `vp pack`/`vp test`
- [ ] **pnpm migration:** `pnpm install` succeeds -- verify with `pnpm test` AND `pnpm build`, not just install
- [ ] **pnpm migration:** CI updated -- workflows use pnpm, `packageManager` field set, `package-lock.json` removed
- [ ] **pnpm migration:** `oxc-parser` and `oxc-walker` native binaries work under pnpm symlink structure
- [ ] **magic-regexp:** Static patterns converted -- verify dynamic patterns in `rewriter.ts` are intentionally left as raw regex (not forgotten)
- [ ] **magic-regexp:** Build-time transform configured OR runtime overhead measured and accepted (1 kB for Node.js library is fine)
- [ ] **@theme support:** Standard theme tokens (`--color-*`, `--spacing-*`) produce correct CSS via mapped `createGenerator` config
- [ ] **@theme support:** Theme + variant interaction tested -- `hover:bg-brand` where `brand` comes from @theme
- [ ] **@theme support:** Generator cache correctly invalidates -- test: theme A then theme B produces different CSS
- [ ] **@theme support:** `convert()` API contract unchanged -- all existing tests pass without modification
- [ ] **@theme support:** Theme merge extends preset-wind4 defaults, does not replace them
- [ ] **Overall:** `pnpm pack --dry-run` output lists same publishable files as before migration

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| vite-plus pack produces wrong output | LOW | Revert to `tsdown.config.ts` (keep it until verified). Run `tsdown` directly as fallback. |
| pnpm phantom dep breaks build/test | LOW | Run `pnpm add <missing-package>` for each missing dep. One-time fix, quick. |
| Generator cache serves stale theme | MEDIUM | Call `resetGenerator()` to clear cache. Add theme to cache key. Re-run affected tests. |
| magic-regexp breaks dynamic pattern | LOW | Revert that specific pattern to raw regex. Mixed approach is the correct design. |
| preset-wind4 cannot handle mapped theme tokens | HIGH | May need to contribute upstream to UnoCSS or build a more sophisticated theme translation layer. File UnoCSS issue for @theme support. |
| @theme parser misses edge cases | MEDIUM | Start with strict parser for standard Tailwind v4 namespaces only. Expand incrementally. Log unrecognized namespaces as warnings. |
| vite-plus alpha API changes break config | MEDIUM | Pin exact version. If breaking change occurs, revert to separate tsdown.config.ts + vitest.config.ts until next stable release. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| vite-plus alpha instability | Phase 1: Toolchain Migration | `vp pack` output matches tsdown output; `vp test` finds all tests; all existing tests pass |
| Vitest config loss in unified config | Phase 1: Toolchain Migration | Test count identical before/after; environment is 'node'; include globs preserved |
| pnpm phantom dependencies | Phase 1: Toolchain Migration | `pnpm test` and `pnpm build` pass; no `shamefully-hoist` in .npmrc |
| pnpm CI cache invalidation | Phase 1: Toolchain Migration | CI workflow uses pnpm with frozen lockfile and store cache; no package-lock.json |
| magic-regexp over-application to dynamic regex | Phase 2: Code Quality | Dynamic patterns in rewriter.ts remain as raw regex; static patterns use magic-regexp |
| magic-regexp transform unavailable in tsdown | Phase 2: Code Quality | Either unplugin configured OR runtime overhead measured as acceptable |
| preset-wind4 @theme CSS block gap | Phase 3: Theme Support | Theme parser extracts tokens; mapped tokens produce correct CSS via createGenerator |
| Generator cache stale theme | Phase 3: Theme Support | Test: sequential convert() calls with different themes produce different CSS |
| @theme namespace mapping completeness | Phase 3: Theme Support | Tests cover colors, spacing, fontSize, fontFamily at minimum |
| Theme + custom variant composition | Phase 3: Theme Support | `ui-checked:bg-brand` where brand is theme-defined produces correct CSS |
| Theme merge replaces instead of extends defaults | Phase 3: Theme Support | Default Tailwind utilities still work after custom theme applied |

## Sources

- [UnoCSS preset-wind4 docs](https://unocss.dev/presets/wind4) -- confirmed: no @theme CSS block support, JS theme config only (HIGH confidence)
- [UnoCSS Tailwind v4 Support Plan #4411](https://github.com/unocss/unocss/issues/4411) -- closed April 2025, @theme not mentioned (HIGH confidence)
- [UnoCSS theme configuration](https://unocss.dev/config/theme) -- JS-based theme API documentation (HIGH confidence)
- [Vite+ configuration docs](https://viteplus.dev/config/) -- unified defineConfig with pack, test, lint, fmt blocks (MEDIUM confidence -- alpha)
- [Vite+ pack docs](https://viteplus.dev/guide/pack) -- `vp pack` wraps tsdown, accepts all tsdown options (MEDIUM confidence -- alpha)
- [Vite+ GitHub](https://github.com/voidzero-dev/vite-plus) -- alpha release March 2026 (HIGH confidence)
- [Vite+ announcement](https://voidzero.dev/posts/announcing-vite-plus) -- ecosystem context, tsdown/vitest integration (HIGH confidence)
- [magic-regexp docs](https://regexp.dev/guide/usage) -- compiled-away, 1.06 kB runtime, no backreference support documented (MEDIUM confidence)
- [magic-regexp npm](https://www.npmjs.com/package/magic-regexp) -- v0.11.0, zero-dependency (HIGH confidence)
- [magic-regexp GitHub](https://github.com/unjs/magic-regexp) -- UnJS ecosystem, transform is unplugin-based (HIGH confidence)
- [pnpm phantom dependencies](https://medium.com/@ddylanlinn/why-your-code-breaks-after-switching-to-pnpm-the-phantom-dependencies-36e779c3a4a0) -- strict resolution prevents phantom deps (HIGH confidence)
- [pnpm migration guide](https://divriots.com/blog/switching-to-pnpm/) -- lockfile migration, CI considerations (MEDIUM confidence)

---
*Pitfalls research for: vanillify v1.1 -- vite-plus, magic-regexp, pnpm, @theme support*
*Researched: 2026-04-05*
