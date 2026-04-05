# Project Research Summary

**Project:** vanillify v1.1 — Toolchain & Theme Support
**Domain:** TypeScript library — Tailwind CSS to vanilla CSS converter (milestone additions)
**Researched:** 2026-04-05
**Confidence:** MEDIUM-HIGH

## Executive Summary

Vanillify v1.1 introduces four changes: migrating to pnpm, adopting vite-plus for unified build/test config, replacing static regex patterns with magic-regexp, and -- the headline feature -- supporting Tailwind v4 `@theme` blocks. The first three are toolchain alignment with the VoidZero/UnJS ecosystem (pnpm, vite-plus, magic-regexp are all standard in this stack). The fourth is the only feature that changes vanillify's runtime behavior and public API.

The `@theme` support story is better than the researchers initially assessed. Testing against the actual UnoCSS preset-wind4 test suite reveals that **preset-wind4 fully supports custom theme values via the JS `theme` config object** passed to `createGenerator()`. Nested color objects, custom CSS variable values, theme safelists, and custom variable prefixes all work. The gap is narrow and specific: preset-wind4 does not parse Tailwind v4's `@theme {}` CSS syntax. Vanillify's job is therefore a **parsing problem, not a generation problem** -- parse the `@theme` CSS block, convert it to the JS `theme` config format that `createGenerator` already accepts. This significantly de-risks the feature: the UnoCSS engine handles all the hard work of generating correct utilities from theme values; vanillify just needs to bridge the CSS syntax to JS config.

The primary risks are (1) vite-plus is alpha software (v0.1.15) that could have breaking changes, mitigated by its wrapping of stable tools (tsdown, vitest) and the reversibility of the migration; and (2) the `@theme` namespace mapping from Tailwind v4 CSS variable prefixes (`--color-*`, `--spacing-*`) to UnoCSS Wind4 theme keys needs empirical validation -- not all key names match 1:1. The theme `process` hook in preset-wind4 provides an escape hatch for edge cases.

---

## Key Findings

### Recommended Stack (v1.1 Additions)

The v1.1 stack adds three new dependencies and promotes pnpm as the package manager. The existing core stack (`@unocss/core`, `@unocss/preset-wind4`, `oxc-parser`, `citty`, `consola`, `pathe`) is unchanged. The additions are ecosystem-aligned: all come from VoidZero or UnJS.

**New core technologies:**
- `vite-plus` ^0.1.15: Unified build/test config -- replaces separate `tsdown.config.ts` and `vitest.config.ts` with a single `vite.config.ts` using `defineConfig({ pack, test })`. Alpha but wraps stable tools (tsdown, vitest, oxlint, oxfmt).
- `magic-regexp` ^0.11.0: Type-safe, readable regex -- compiles away at build time to pure RegExp via unplugin. From UnJS ecosystem (same as citty/consola). 1.2M weekly downloads, stable.
- `pnpm` ^9.x: Package manager -- strict dependency isolation, content-addressable store, standard in VoidZero/Vite ecosystem.

**Removed (replaced by vite-plus):**
- Separate `tsdown` devDep (now `vp pack`)
- Separate `vitest` devDep (now `vp test`)
- `@antfu/eslint-config` (defer oxlint adoption -- keep existing eslint for now)
- `prettier` (defer oxfmt adoption)

**Avoid:** Installing `tsdown` and `vitest` alongside `vite-plus` (version conflicts). Using `shamefully-hoist=true` in pnpm (defeats strict resolution). PostCSS for `@theme` parsing (overkill for flat CSS custom property extraction).

### Expected Features

**Must have (v1.1 table stakes):**
- Tailwind v4 `@theme` block support for core namespaces (`--color-*`, `--spacing-*`, `--font-*`, `--breakpoint-*`, `--radius-*`, `--shadow-*`) -- any converter claiming v4 support that cannot resolve theme-defined classes is incomplete
- pnpm as package manager -- npm looks out-of-place in the VoidZero ecosystem

**Should have (differentiators):**
- vite-plus unified `defineConfig` -- signals first-class vite+ ecosystem alignment, reduces config surface for contributors
- magic-regexp for complex regex patterns (variant parser, @layer matching, file extension matching) -- type-safe, self-documenting, zero runtime cost
- Theme-aware class resolution -- no existing converter handles `@theme`-defined classes; this is vanillify's competitive edge for v4 adoption

**Defer (v1.2+):**
- `@theme { --*: initial }` (full theme reset) -- requires reconstructing entire UnoCSS default theme
- `@theme inline { ... }` -- no UnoCSS equivalent
- `@keyframes` inside `@theme` -- different UnoCSS mechanism
- vite-plus `lint`/`fmt` blocks -- wait for vite-plus to exit alpha
- Automatic `@theme` discovery from project CSS files -- breaks stateless API design
- Additional `@theme` namespaces beyond the core six -- add based on user demand

### Architecture Approach

The v1.1 changes layer cleanly onto vanillify's existing four-stage pipeline. The `@theme` feature follows the exact same architectural pattern as `@custom-variant` resolution: parse CSS syntax into structured data, map that data to UnoCSS JS config, pass to `createGenerator`. Three new files (`src/theme/parser.ts`, `src/theme/resolver.ts`, `src/theme/types.ts`) mirror the existing `src/variants/` structure. The generator cache key extends to include theme identity alongside variant identity. The `convert()` API gains one new optional field (`theme: string | Record<string, string>`) and the CLI gains `--theme <file>`. The toolchain changes (vite-plus, pnpm) are config-only with zero source code impact. magic-regexp converts 9 of 14 regex patterns; the 5 dynamic patterns in `rewriter.ts` correctly remain as raw RegExp.

**CRITICAL CORRECTION from preset-wind4 test suite analysis:** The UnoCSS `theme` config object passed to `createGenerator()` is fully functional for custom theme values. Nested color objects (`foo.primary.veryCool`), CSS variable values (`var(--custom-css-variable, #123456)`), theme safelists (`'colors:red-100'`), variable prefix support (`variablePrefix: 'foo-'`), and theme processing hooks (`preflights.theme.process`) all work. This means vanillify's `@theme` resolver just needs to produce the right JS object shape -- the generation is handled.

**Major components (new/modified):**
1. `src/theme/parser.ts` (NEW) -- parses `@theme` CSS blocks, extracts `--namespace-name: value` declarations
2. `src/theme/resolver.ts` (NEW) -- maps Tailwind v4 CSS namespaces to UnoCSS Wind4 theme keys
3. `src/theme/types.ts` (NEW) -- `ThemeOption`, `ParsedTheme`, `ThemeConfig` type definitions
4. `src/pipeline/generator.ts` (MODIFIED) -- theme in cache key + `createGenerator` config
5. `src/types.ts` (MODIFIED) -- `ThemeOption` added to `ConvertOptions`
6. `src/cli.ts` (MODIFIED) -- `--theme` flag + magic-regexp for file extension matching
7. `vite.config.ts` (NEW, replaces tsdown.config.ts + vitest.config.ts) -- unified vite-plus config

### Critical Pitfalls

1. **preset-wind4 does not parse `@theme` CSS blocks** -- vanillify must bridge the gap by parsing `@theme` CSS and converting to UnoCSS's JS `theme` config. The generation engine works; the parsing is vanillify's responsibility. Build integration tests that verify theme-defined classes produce correct CSS via the mapped config.

2. **Generator cache must include theme identity** -- the existing cache keys by variant config only. Adding theme without extending the cache key causes stale generators to silently return wrong CSS. Use `JSON.stringify(themeConfig)` as part of the composite cache key. Test explicitly: theme A then theme B must produce different CSS.

3. **vite-plus alpha instability** -- pin to exact version. Verify `vp pack` produces identical dist/ structure to current tsdown output before deleting `tsdown.config.ts`. Keep fallback path: vite-plus wraps stable tools, so reverting to separate configs is straightforward.

4. **magic-regexp cannot replace dynamic runtime regex** -- `rewriter.ts` constructs regex from CSS class names at runtime (`new RegExp(pattern + ...)`). This is fundamentally incompatible with magic-regexp's compile-time design. Accept a mixed approach: 9 static patterns convert, 5 dynamic patterns stay raw. Do not force 100% adoption.

5. **`@theme` namespace mapping is not 1:1 between Tailwind v4 and Wind4** -- Wind4 renamed some theme keys (`fontFamily` to `font`, `borderRadius` to `radius`). Start with the six core namespaces, log warnings for unrecognized namespaces, and build a mapping test suite early. The `preflights.theme.process` hook provides an escape hatch for edge-case transformations.

---

## Implications for Roadmap

Based on the dependency graph across all four research files, the natural phase structure is: foundational tooling first (zero-risk, enables subsequent work), then code quality improvements (magic-regexp), then the headline feature (@theme support). This order is driven by concrete dependencies: pnpm must precede vite-plus (vite-plus expects pnpm), vite-plus must precede magic-regexp (the transform plugin goes in `vite.config.ts`), and @theme is independent but benefits from all three being in place.

### Phase 1: Toolchain Foundation (pnpm + vite-plus)

**Rationale:** Zero-risk foundational work that must happen before feature development. pnpm migration is a prerequisite for smooth vite-plus adoption (vite-plus docs recommend pnpm). Both are config-only changes with zero source code impact, making them safe to combine.
**Delivers:** pnpm as package manager with `pnpm-lock.yaml`; unified `vite.config.ts` replacing `tsdown.config.ts` + `vitest.config.ts`; updated package.json scripts (`vp pack`, `vp test`); CI pipeline updates for pnpm
**Addresses:** pnpm migration (P1), vite-plus unified config (P1)
**Avoids:** Pitfall 3 (vite-plus alpha instability -- pin version, verify output), Pitfall 4 (vitest config loss -- copy config verbatim, compare test counts), Pitfall 5 (phantom deps -- run full test suite after pnpm switch), Pitfall 8 (CI cache invalidation -- update workflows atomically)
**Verification gate:** `vp pack` produces identical dist/ structure; `vp test` discovers all existing tests; `pnpm pack --dry-run` lists same publishable files

### Phase 2: Code Quality (magic-regexp)

**Rationale:** Requires vite-plus config to be in place (transform plugin goes in `vite.config.ts`). Independent of @theme feature. Low risk, improves readability of the patterns that matter most (variant parser, @layer matching).
**Delivers:** 9 of 14 regex patterns converted to type-safe, readable magic-regexp; dynamic patterns in `rewriter.ts` explicitly marked as raw RegExp; build-time transform configured (or runtime overhead accepted as ~1 kB for Node.js library)
**Addresses:** magic-regexp for complex patterns (P1), magic-regexp for simple patterns (P2 stretch)
**Avoids:** Pitfall 6 (dynamic regex over-application -- leave rewriter.ts patterns raw), Pitfall 7 (transform unavailability -- test with tsdown/Rolldown, accept runtime fallback)
**Verification gate:** All existing tests pass with zero behavior change; converted patterns produce identical match results

### Phase 3: Tailwind v4 @theme Support

**Rationale:** The headline feature and the only runtime/API change. Largest in scope, highest in value, requires the most testing. Must come last because it changes the public API surface. Follows the exact same architectural pattern as `@custom-variant` resolution (parse CSS, map to UnoCSS config, pass to `createGenerator`). De-risked by the finding that preset-wind4's JS `theme` config is fully functional.
**Delivers:** `@theme` CSS block parser; namespace-to-theme-key resolver for 6 core namespaces; `theme` option on `ConvertOptions`; `--theme` CLI flag; generator cache extended with theme identity; theme + variant composition (e.g., `hover:bg-brand` where `brand` comes from `@theme`)
**Addresses:** Tailwind v4 `@theme` support (P1), theme-aware class resolution (differentiator)
**Avoids:** Pitfall 1 (preset-wind4 @theme gap -- bridged by vanillify's parser), Pitfall 2 (generator cache staleness -- composite key), Pitfall 9 (lossy namespace mapping -- start with 6 core namespaces, warn on unrecognized), Pitfall 10 (theme + variant interaction -- explicit integration tests)
**Verification gate:** `bg-brand` produces correct CSS when `--color-brand` is defined in `@theme`; `hover:bg-brand` works; sequential calls with different themes produce different CSS; all existing tests pass without modification

### Phase Ordering Rationale

- **Phase 1 before Phase 2:** magic-regexp's build-time transform plugin requires `vite.config.ts` to exist. pnpm must precede vite-plus per vite-plus documentation.
- **Phase 2 before Phase 3:** magic-regexp patterns can be used in the new `@theme` parser if desired. More importantly, Phase 2 is low-risk and should be completed before the high-complexity @theme work.
- **Phase 3 last:** Only phase that changes runtime behavior and public API. All toolchain/quality improvements should be stable before adding a new feature surface.
- **All three phases are independently shippable:** Each produces a valid, releasable state. If @theme support takes longer than expected, Phases 1 and 2 can ship as a minor release.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (@theme Support):** The Wind4 theme key mapping table needs empirical validation. Run actual `createGenerator` calls with each namespace (`--color-*`, `--spacing-*`, `--font-*`, `--breakpoint-*`, `--radius-*`, `--shadow-*`) and verify correct utility class CSS output. The preset-wind4 test suite confirms colors and nested objects work, but spacing, fonts, radius, and shadow mappings need hands-on testing. The `preflights.theme.process` hook and `safelist` feature should be evaluated as tools for edge cases.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Toolchain Foundation):** pnpm migration and vite-plus config consolidation are well-documented with clear migration guides. No novel technical decisions.
- **Phase 2 (magic-regexp):** The architecture research already audited all 14 regex patterns and categorized each as convertible or not. Implementation is mechanical.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | vite-plus is alpha but wraps stable tools; pnpm and magic-regexp are mature. All have official docs and active maintenance. |
| Features | MEDIUM-HIGH | Feature scope is well-defined. The critical finding that preset-wind4's JS `theme` config works (from test suite analysis) upgrades @theme confidence from MEDIUM to MEDIUM-HIGH. Namespace mapping still needs validation. |
| Architecture | HIGH | @theme integration follows the exact pattern established by @custom-variant. New files mirror existing structure. Generator cache extension is straightforward. Zero ambiguity in component boundaries. |
| Pitfalls | MEDIUM-HIGH | All pitfalls have concrete prevention strategies and recovery paths. The only MEDIUM item is the Wind4 theme key mapping completeness -- this is a known-unknown with a clear validation path. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Wind4 theme key mapping validation:** The mapping from Tailwind v4 `@theme` CSS variable prefixes to UnoCSS Wind4 theme keys is based on documentation, not runtime verification. The six core namespaces (`--color-*`, `--spacing-*`, `--font-*`, `--breakpoint-*`, `--radius-*`, `--shadow-*`) need to be tested against actual `createGenerator` output. Resolution: build a mapping test suite as the first task in Phase 3.
- **magic-regexp unplugin compatibility with Rolldown/tsdown:** Whether the magic-regexp build-time transform works through vite-plus's `vp pack` (which uses tsdown/Rolldown) is undocumented. Resolution: test in Phase 2; if the transform does not work, accept ~1 kB runtime overhead (acceptable for a Node.js library).
- **vite-plus test import change:** Test files must change `from 'vitest'` to `from 'vite-plus/test'`. This is a mechanical change but could cause confusion if vite-plus's re-export surface differs from vitest's. Resolution: verify all imported test utilities (`describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach`) are re-exported by `vite-plus/test`.
- **Theme + custom variant composition:** Using `hover:bg-brand` or `ui-checked:bg-brand` where `brand` comes from `@theme` requires both theme and variant config to be present in the same `createGenerator` call. This works in theory (both are config options) but has not been tested end-to-end. Resolution: write explicit integration tests in Phase 3.

---

## Sources

### Primary (HIGH confidence)
- [UnoCSS Core API](https://unocss.dev/tools/core) -- `createGenerator`, `generate()` API, theme config
- [UnoCSS Theme Configuration](https://unocss.dev/config/theme) -- `theme` object, `extendTheme` API
- [UnoCSS preset-wind4](https://unocss.dev/presets/wind4) -- Wind4 theme keys, CSS variable generation
- **UnoCSS preset-wind4 test suite** (user-provided) -- confirms JS `theme` config works: nested colors, CSS variables, safelists, `variablePrefix`, `preflights.theme.process`
- [oxc-parser npm](https://www.npmjs.com/package/oxc-parser) -- `parseSync` API, v0.123.0
- [magic-regexp docs](https://regexp.dev/guide/usage) -- createRegExp API, build-time transform
- [vite-plus config docs](https://viteplus.dev/config/) -- defineConfig with pack, test blocks
- [pnpm migration](https://pnpm.io/cli/import) -- lockfile conversion

### Secondary (MEDIUM confidence)
- [UnoCSS Tailwind v4 Support #4411](https://github.com/unocss/unocss/issues/4411) -- "not fully ready yet"; CSS config file integration outstanding
- [Tailwind v4 @theme docs](https://tailwindcss.com/docs/theme) -- @theme block syntax, namespace conventions
- [vite-plus GitHub](https://github.com/voidzero-dev/vite-plus) -- alpha release March 2026
- [vite-plus migration guide](https://viteplus.dev/guide/migrate) -- step-by-step consolidation

### Tertiary (LOW confidence)
- [Announcing Vite+](https://voidzero.dev/posts/announcing-vite-plus) -- ecosystem direction context
- [magic-regexp GitHub](https://github.com/unjs/magic-regexp) -- unplugin transform implementation details

---
*Research completed: 2026-04-05*
*Ready for roadmap: yes*
