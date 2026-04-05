# Pitfalls Research

**Domain:** Replacing UnoCSS engine with Tailwind v4's native compile().build() API in vanillify
**Researched:** 2026-04-05
**Confidence:** MEDIUM (compile() API is exported but officially "internal/undocumented/not public" per maintainer statements)

---

## Critical Pitfalls

### Pitfall 1: build() Is Additive and Stateful -- Cannot Isolate Per-Node CSS

**What goes wrong:**
Vanillify currently calls `generateCSS()` once per node (per `className` attribute) to get isolated CSS for that node only. The rewriter then rewrites selectors from `.utility-name` to `.node0`, `.node1`, etc. Tailwind's `build()` is explicitly additive -- the source code comments state "This currently assumes that we only add new candidates and never remove any." Each `build()` call returns the cumulative CSS for ALL candidates ever passed, not just the new ones. If you call `build(['flex'])` then `build(['flex', 'grid'])`, the second call returns CSS for both `flex` AND `grid`, not just `grid`.

**Why it happens:**
Tailwind v4's compile/build is designed for a build-tool pipeline where you scan all source files and produce one CSS bundle. It caches compiled results internally and only regenerates when new candidates appear. There is no `reset()` or `clear()` method on the compiler instance. This is fundamentally different from UnoCSS's `generator.generate(tokens)` which returns CSS for exactly the tokens you pass.

**How to avoid:**
Two strategies, in order of preference:

1. **Single-pass generation with post-hoc splitting (recommended):** Collect ALL unique class tokens across ALL nodes first. Call `build()` once with the full set. Then parse the resulting CSS to extract per-class rules and map them to each node. This aligns with how Tailwind is designed to work and avoids fighting the additive behavior.

2. **Fresh compiler per node (fallback, expensive):** Call `compile()` for each node to get a fresh stateless compiler, then call `build()` once. This defeats caching entirely and will be slow -- `compile()` parses the full CSS input and resolves all imports each time. Reserve for correctness validation only.

**Warning signs:**
- CSS output grows monotonically across nodes even when later nodes have fewer classes
- `.node5` CSS block contains rules for classes only used in `.node0`
- Test: call `build(['flex'])` then `build(['grid'])` and check if the second output contains `.flex` rules (it will)

**Phase to address:**
Phase 1 (core generator rewrite). This is the most fundamental architectural difference and must be solved before anything else works.

---

### Pitfall 2: CSS Output Includes Layers, Preflight, and Theme Variables by Default

**What goes wrong:**
When you call `compile('@import "tailwindcss"')`, the compiler ingests ALL of Tailwind: theme variables (`@layer theme`), preflight/reset styles (`@layer base`), and utilities (`@layer utilities`). The `build()` output is the FULL compiled CSS -- not just utility rules. This means the output will contain hundreds of lines of CSS reset (preflight), `:root` variable declarations, and `@layer` wrappers around everything.

Vanillify's current `stripLayerWrappers()` and `extractThemeLayer()` in `generator.ts` are tuned to UnoCSS's layer format (`/* layer: default */`, `/* layer: theme */`). Tailwind v4 uses native CSS `@layer` blocks instead, which have different syntax but similar structure. The existing stripping logic may partially work but will miss Tailwind-specific patterns.

**Why it happens:**
Tailwind v4 is an all-in-one CSS processor. `@import "tailwindcss"` expands to theme + preflight + utilities. Unlike UnoCSS where you get just utility CSS from `generate()`, Tailwind gives you the complete stylesheet.

**How to avoid:**
Control what gets compiled by using selective imports in the CSS input string:

```typescript
// Only utilities -- no preflight, no theme layer
const compiler = await compile(`
  @layer theme, base, components, utilities;
  @import "tailwindcss/theme.css" layer(theme);
  @import "tailwindcss/utilities.css" layer(utilities);
`, { loadStylesheet });
```

Or for utilities only with no theme:
```typescript
const compiler = await compile(`
  @import "tailwindcss/utilities.css" layer(utilities);
`, { loadStylesheet });
```

Then strip the `@layer utilities { ... }` wrapper from the output. The existing `stripLayerWrappers()` should work since Tailwind v4 uses standard CSS `@layer` syntax (unlike UnoCSS's comment-based markers).

**Warning signs:**
- Output CSS is 500+ lines for a component with 3 utility classes
- CSS contains `*, ::before, ::after` reset rules (preflight leaking)
- CSS contains `--color-*`, `--spacing-*` variable declarations you did not request
- Tests comparing output length between UnoCSS and Tailwind show 10x+ size difference

**Phase to address:**
Phase 1. The CSS input string to `compile()` determines what layers are included. Get this right in the initial adapter.

---

### Pitfall 3: loadStylesheet Callback Is Required and Non-Trivial

**What goes wrong:**
`compile()` throws `"No 'loadStylesheet' function provided to 'compile'"` if you do not provide the `loadStylesheet` option. Even with a minimal CSS input like `@import "tailwindcss/utilities.css"`, the compiler needs to resolve that import to actual CSS content. This means vanillify must either:
- Use `@tailwindcss/node` which provides filesystem-based resolution (adds a dependency)
- Implement a custom `loadStylesheet` that resolves Tailwind's internal CSS files from `node_modules`

If you get the resolution wrong, errors are opaque -- the compiler may silently produce empty CSS or throw with unhelpful messages.

**Why it happens:**
Tailwind v4's compile() is deliberately decoupled from the filesystem. It is a pure CSS compiler that delegates I/O to callbacks. This is good design for portability (works in browsers, workers, etc.) but means every consumer must wire up resolution.

**How to avoid:**
Use `@tailwindcss/node`'s `compile` wrapper which provides filesystem-backed `loadStylesheet` and `loadModule` out of the box. This is what the CLI and Vite plugin use internally.

```typescript
import { compile } from '@tailwindcss/node';
// This version handles loadStylesheet automatically via enhanced-resolve
const compiler = await compile(cssInput, { base: process.cwd() });
```

If you want to avoid the `@tailwindcss/node` dependency, implement a minimal resolver:

```typescript
import { compile } from 'tailwindcss';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';

const tailwindBase = dirname(require.resolve('tailwindcss/package.json'));

const compiler = await compile(cssInput, {
  loadStylesheet: async (id, base) => {
    const resolved = resolve(base || tailwindBase, id);
    const content = await readFile(resolved, 'utf-8');
    return { path: resolved, base: dirname(resolved), content };
  }
});
```

**Warning signs:**
- `compile()` throws about missing `loadStylesheet` immediately
- CSS output is empty despite valid candidates
- Resolution errors when Tailwind's internal CSS files import each other (chain resolution)

**Phase to address:**
Phase 1. This is the first line of code you write -- if compile() does not initialize, nothing works.

---

### Pitfall 4: Selector Format Differences Break the Rewriter

**What goes wrong:**
The entire `rewriter.ts` (448 lines) is built around UnoCSS's selector escaping conventions. UnoCSS escapes CSS special characters with backslashes: `hover:bg-blue-700` becomes `.hover\:bg-blue-700:hover`. The rewriter's `buildSelectorPattern()`, `extractPseudo()`, and `matchesAnyPattern()` functions all assume this format.

Tailwind v4's CSS output may use different escaping, different selector structures, or different at-rule nesting. Key differences:
- Tailwind uses `@property` rules for custom properties (UnoCSS does not)
- Tailwind may output `@media` queries with range syntax (`@media (width >= 640px)`) vs UnoCSS's `@media (min-width: 640px)`
- Tailwind groups related utilities differently -- e.g., `space-x-4` generates a selector with `> :not(:last-child)` child combinators
- Variant selectors like `hover:` may use different nesting or ordering

If the rewriter's regex patterns do not match Tailwind's output format, nodes silently get empty CSS or incorrect selectors.

**Why it happens:**
The rewriter was hand-tuned to UnoCSS output. It uses regex-based line-by-line parsing (`matchesAnyPattern` returns `true` by default as a safety fallback), string-based pseudo extraction, and brace-depth tracking. All of these assumptions may break with a different CSS engine.

**How to avoid:**
1. **Snapshot test the CSS output format** before writing any rewriter changes. Generate CSS for 20-30 representative utilities (including variants, arbitrary values, responsive, dark mode) and capture the exact output format.
2. **Consider a CSS parser** instead of regex for selector rewriting. A lightweight CSS parser (Lightning CSS is already bundled in Tailwind) would be more robust than line-by-line regex matching.
3. If sticking with regex, build a comprehensive mapping of Tailwind output patterns and test each one. The single-pass approach (Pitfall 1) actually simplifies this -- you parse the full CSS output once and extract per-class rule blocks, rather than trying to match selectors.

**Warning signs:**
- `matchesAnyPattern()` always returns `true` (the current fallback behavior) masking missed patterns
- Pseudo-class extraction produces `null` for Tailwind variants that work in UnoCSS
- Media query blocks have different wrapper syntax than expected
- Space/divide utilities produce multi-selector rules the rewriter does not handle

**Phase to address:**
Phase 2 (rewriter adaptation). Must come after Phase 1 (generator) so you have actual Tailwind CSS output to test against.

---

### Pitfall 5: compile() API Is Not a Public API -- Breaking Changes Without Notice

**What goes wrong:**
A Tailwind maintainer explicitly stated the programmatic API is "internal/undocumented/not public." The `compile` function is exported from the `tailwindcss` package, but it is not documented on tailwindcss.com, has no stability guarantees, and can change in any minor or patch release. The function signature, return type, and build() behavior could all change in v4.3, v4.4, etc.

**Why it happens:**
Tailwind Labs focuses on the CLI and build-tool integrations (Vite plugin, PostCSS plugin) as the public surface. The underlying `compile()` is an implementation detail that those tools use internally.

**How to avoid:**
1. **Pin the Tailwind version tightly** -- use exact version (`4.2.x`) not caret range (`^4.2.x`)
2. **Wrap compile() in a thin adapter** (~40-50 lines as planned in PROJECT.md). The adapter is the ONLY file that imports from `tailwindcss` directly. If the API changes, you update one file.
3. **Integration test against the actual compile() output** -- not mocked. Tests will fail immediately when a Tailwind update breaks the API.
4. **Subscribe to Tailwind releases** and review changelogs. The `@tailwindcss/node` package is a slightly more stable wrapper since it is used by the CLI.

**Warning signs:**
- Tailwind minor version bump causes vanillify tests to fail
- `build()` return type changes (string to object, or gains additional properties)
- New required options added to `compile()`

**Phase to address:**
Phase 1 (design the adapter boundary). The thin-wrapper design from PROJECT.md is exactly right. Enforce it strictly -- no Tailwind imports outside the adapter file.

---

## Moderate Pitfalls

### Pitfall 6: No Built-in Unmatched Class Detection

**What goes wrong:**
UnoCSS's `generate()` returns a `matched` Set containing every token that produced CSS. Vanillify uses this to compute `unmatched = tokens.filter(t => !result.matched.has(t))` and emit warnings. Tailwind's `build()` returns only a CSS string -- no matched/unmatched metadata. If you pass `['flex', 'bg-nonexistent']`, you get CSS for `flex` and silence for `bg-nonexistent`. No error, no warning, no way to know something was skipped.

**How to avoid:**
After calling `build()`, parse the returned CSS to determine which candidates actually generated rules. Build a set of "classes that appear as selectors in the output" and diff against the input candidates. This is approximate but catches most cases. For variants (e.g., `hover:bg-blue-700`), the selector will be escaped differently from the input token, so the matching logic needs to account for Tailwind's escaping.

Alternatively, call `build()` with one candidate at a time and check if the output CSS grew -- but this fights the additive behavior and is slow.

**Phase to address:**
Phase 2 or 3. Not blocking for core functionality but needed before public release to maintain warning parity.

---

### Pitfall 7: compile() Instantiation Cost Is High

**What goes wrong:**
`compile()` parses the full input CSS, resolves all imports (via `loadStylesheet` callbacks which hit the filesystem), processes `@theme` blocks, builds the utility registry, and resolves plugins. This is expensive -- measured in tens of milliseconds per call. If vanillify creates a fresh compiler per node (to work around additive build behavior), a component with 20 nodes means 20 compile() calls, each doing full CSS resolution.

**Why it happens:**
Tailwind's architecture assumes compile-once, build-many. The build-tool plugins (Vite, PostCSS) instantiate one compiler per project build. Vanillify's per-node isolation pattern is outside the intended usage.

**How to avoid:**
1. **One compiler instance per convert() call** -- instantiate once, build once with all candidates
2. **Cache the compiler across convert() calls** that share the same CSS input (same theme, same config). The current `_cache` Map pattern in `generator.ts` translates directly -- key by the CSS input string hash
3. **Never create a compiler per node** unless as a last-resort correctness check

**Phase to address:**
Phase 1. The caching strategy must be designed upfront to avoid painting yourself into a performance corner.

---

### Pitfall 8: @theme and @custom-variant Just Work -- But the Input CSS Must Include Them

**What goes wrong:**
One of the big wins of this migration is deleting the custom theme and variant translation layers (`src/theme/` and `src/variants/`). Tailwind handles `@theme` and `@custom-variant` natively. BUT: this only works if the user's CSS definitions are included in the input to `compile()`. If vanillify constructs the CSS input string without the user's `@theme` and `@custom-variant` blocks, Tailwind will not know about them.

The current API accepts `customVariants` as a JavaScript object (`VariantObject[]`) and `themeConfig` as a JS object. The new API needs to accept raw CSS strings containing `@theme` and `@custom-variant` directives and prepend/append them to the compile() input.

**Why it happens:**
Tailwind v4 is CSS-first. Configuration is CSS, not JavaScript. The public API shape change from "JS objects" to "CSS strings" is the migration's whole point, but it is easy to forget edge cases -- e.g., the user passes a CSS file path that needs to be read and concatenated.

**How to avoid:**
1. Accept `themeCss: string` parameter (CSS content, not a file path) in the public API
2. Concatenate user CSS before the Tailwind import: `${userCss}\n@import "tailwindcss/utilities.css" layer(utilities);`
3. Test with real QDS `@custom-variant` definitions to verify they work in Tailwind's pipeline
4. Ensure `loadStylesheet` can resolve any `@import` statements in the user's CSS

**Phase to address:**
Phase 2 (public API adaptation). The generator adapter (Phase 1) should accept raw CSS; the public API change comes after.

---

### Pitfall 9: Preflight Duplication in Multi-Call Scenarios

**What goes wrong:**
If vanillify processes multiple components in a project and each conversion includes preflight/base styles, the combined output contains duplicate resets. This was not a problem with UnoCSS (which returned only utility CSS), but Tailwind's full output includes preflight by default.

Even if you exclude preflight via selective imports, the theme layer (`:root` variable definitions) will duplicate across conversions if each compiler instance includes it.

**How to avoid:**
- Default to utilities-only output (no preflight, no theme layer)
- Provide a separate `extractTheme()` function that returns the theme CSS once for the project
- Document that preflight should be included separately via standard Tailwind setup

**Phase to address:**
Phase 2 (output format). Design the output to be composable -- theme once, utilities per component.

---

## Minor Pitfalls

### Pitfall 10: Version Conflict -- tailwindcss v3 vs v4 in the Same Project

**What goes wrong:**
If a user's project has `tailwindcss@3.x` installed and vanillify depends on `tailwindcss@4.x`, npm/pnpm may resolve to the wrong version. The `compile` export does not exist in v3, causing `"does not provide an export named 'compile'"` errors. This was a real issue reported in Nuxt UI (github.com/nuxt/ui/issues/2455).

**How to avoid:**
Declare `tailwindcss` as a `peerDependency` with `">=4.0.0"` range. Document the v4 requirement clearly. Add a startup check that verifies the installed Tailwind version.

**Phase to address:**
Phase 3 (packaging/distribution).

---

### Pitfall 11: Media Query Syntax Differences

**What goes wrong:**
Tailwind v4 uses Lightning CSS which outputs modern range media query syntax: `@media (width >= 640px)` instead of the legacy `@media (min-width: 640px)` that UnoCSS produces. If any downstream consumer of vanillify's CSS output uses tools that do not support range syntax (older PostCSS plugins, some minifiers), the CSS will break.

**How to avoid:**
Tailwind's compile() accepts a `polyfills` option that can force legacy syntax. Alternatively, document that vanillify outputs modern CSS and let consumers handle compatibility.

**Phase to address:**
Phase 3 (output format options, if needed).

---

### Pitfall 12: build() Returns Empty String When No Utilities Are Matched

**What goes wrong:**
If the CSS input to `compile()` does not include `@tailwind utilities` or an equivalent utilities import, `build()` returns the compiled CSS without any utility injection. The Features bitfield can be checked -- if `Features.Utilities` is not set, build() will not generate utility CSS regardless of what candidates you pass.

**How to avoid:**
Always include a utilities layer in the compile() input. After compile(), check the `features` bitfield: `if (!(compiler.features & Features.Utilities)) throw new Error(...)`.

**Phase to address:**
Phase 1 (compiler initialization validation).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Use `@tailwindcss/node` instead of raw `compile()` | Filesystem resolution handled for you | Extra dependency, couples to Node.js (no browser/worker support) | Acceptable for v2.0 since vanillify is Node-only. Revisit if portability becomes a requirement |
| Keep regex-based rewriter instead of CSS parser | Fewer dependencies, less rewrite work | Fragile against CSS output format changes, hard to maintain | Only in initial migration. Plan to replace with CSS parser in v2.1+ |
| Pin exact Tailwind version | Stability | Miss bug fixes, security patches | Acceptable for initial release. Use renovate/dependabot with test gates |
| Single build() call with post-hoc CSS splitting | Aligns with Tailwind's architecture | Requires CSS parsing to split per-node | Always -- this is the correct approach, not a shortcut |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `compile()` initialization | Passing `@import "tailwindcss"` and getting preflight + theme + utilities | Use selective imports: only `tailwindcss/theme.css` + `tailwindcss/utilities.css` |
| `loadStylesheet` callback | Hardcoding paths or using `require.resolve` which fails in ESM | Use `@tailwindcss/node` or `import.meta.resolve` with proper ESM resolution |
| `build()` candidates format | Passing a Set (like UnoCSS's `generate()` accepts) | `build()` takes `string[]`, not `Set<string>`. Convert with `[...tokens]` |
| Theme CSS inclusion | Passing theme config as a JS object (old UnoCSS pattern) | Prepend `@theme { ... }` CSS block to the compile() input string |
| Custom variant inclusion | Passing variant objects (old UnoCSS `VariantObject[]`) | Include `@custom-variant` CSS directives in the compile() input |
| Error handling | Assuming build() throws on invalid candidates | build() silently ignores unrecognized candidates -- no errors, no warnings |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Creating compile() instance per node | 50ms+ per node, 1s+ for 20-node components | Single compiler instance per convert() call | Immediately noticeable with >3 nodes |
| Creating compile() instance per convert() call without caching | 50ms overhead per conversion, noticeable in batch processing | Cache compiler instances by CSS input hash (same pattern as current `_cache` Map) | Noticeable at 10+ sequential conversions |
| Parsing CSS output with regex to split per-node rules | Works but O(n*m) where n=nodes, m=CSS lines | Use a streaming CSS tokenizer or simple brace-depth parser | >100 utility classes per component |
| Not reusing loadStylesheet results | Filesystem reads on every compile() | Cache file contents in loadStylesheet callback | Batch processing multiple files |

## "Looks Done But Isn't" Checklist

- [ ] **Generator adapter:** Returns only utility CSS -- verify no preflight rules in output (`*, ::before, ::after` is a telltale sign)
- [ ] **Per-node isolation:** Each `.nodeN` block contains ONLY rules for that node's classes -- verify with a 3-node component where each node has unique classes
- [ ] **Variant selectors:** `hover:`, `focus:`, `sm:`, `dark:` all produce correct pseudo/media selectors -- verify escaping matches what the rewriter expects
- [ ] **Arbitrary values:** `bg-[#ff0000]`, `w-[200px]`, `grid-cols-[1fr_2fr]` all generate correct CSS -- these use different escaping in Tailwind vs UnoCSS
- [ ] **Unmatched detection:** Invalid classes like `bg-nonexistent` produce warnings -- verify the post-hoc detection works
- [ ] **Theme variables:** `:root` custom properties appear in `themeCss` output when user provides `@theme` block -- verify they are separated from utility CSS
- [ ] **Empty input:** `build([])` returns cached CSS or empty string without errors
- [ ] **Duplicate classes:** Same class in multiple nodes does not cause CSS duplication in the per-node output
- [ ] **Public API shape:** `ConvertOptions` and `ConvertResult` types are unchanged -- verify with existing tests before and after migration

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Additive build() leaking CSS between nodes | MEDIUM | Refactor to single-pass + post-hoc splitting. Requires rewriter changes but generator stays the same |
| Preflight in output | LOW | Change the CSS input string to compile(). One-line fix |
| loadStylesheet errors | LOW | Switch to @tailwindcss/node or fix resolution paths. Isolated to adapter file |
| Rewriter selector mismatches | HIGH | Snapshot actual Tailwind output, update all regex patterns, extensive test coverage. Consider CSS parser replacement |
| API breaking change in Tailwind minor | MEDIUM | Update adapter file. If signature changed, may need to update caching logic too. Integration tests catch this immediately |
| Unmatched detection missing | LOW | Add CSS output parsing. Not blocking for core functionality |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Additive build() (P1) | Phase 1: Generator rewrite | Test: per-node CSS contains only that node's rules |
| CSS output format (P2) | Phase 1: Generator rewrite | Test: output does not contain preflight, output size is proportional to input classes |
| loadStylesheet (P3) | Phase 1: Generator rewrite | Test: compile() initializes without errors, resolves Tailwind internal CSS |
| Selector format (P4) | Phase 2: Rewriter adaptation | Test: snapshot tests for 30+ representative utilities match expected selectors |
| API stability (P5) | Phase 1: Adapter design | Verify: all Tailwind imports are in exactly one file |
| Unmatched detection (P6) | Phase 2/3: Warning parity | Test: invalid class names produce warnings |
| Instantiation cost (P7) | Phase 1: Caching design | Benchmark: batch of 10 conversions completes in <500ms |
| Theme/variant CSS input (P8) | Phase 2: Public API | Test: QDS @custom-variant definitions produce correct CSS |
| Preflight duplication (P9) | Phase 2: Output design | Test: multi-component conversion does not contain duplicate resets |
| Version conflict (P10) | Phase 3: Packaging | Verify: peerDependency declared, startup version check |
| Media query syntax (P11) | Phase 3: Output options | Document modern CSS output requirement |
| Empty utilities (P12) | Phase 1: Validation | Test: Features bitfield check on compiler initialization |

## Sources

- [Tailwind CSS v4 compile() source code](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/src/index.ts) -- compile() signature, build() additive behavior confirmed in source comments: "This currently assumes that we only add new candidates and never remove any" (HIGH confidence)
- [GitHub Discussion #16581: How to use Tailwind 4 programmatically](https://github.com/tailwindlabs/tailwindcss/discussions/16581) -- maintainer confirmed API is "internal/undocumented/not public" (HIGH confidence)
- [GitHub Discussion #15881: How to compile Tailwind v4 programmatically](https://github.com/tailwindlabs/tailwindcss/discussions/15881) -- community workarounds, loadStylesheet patterns (MEDIUM confidence)
- [GitHub Discussion #18356: Runtime compilation not working after v4.1](https://github.com/tailwindlabs/tailwindcss/discussions/18356) -- API instability evidence, @tailwindcss/node recommendation (MEDIUM confidence)
- [GitHub Issue #15723: Cannot disable preflight styles](https://github.com/tailwindlabs/tailwindcss/issues/15723) -- selective imports to exclude preflight confirmed working (HIGH confidence)
- [GitHub Issue #19853: Duplicate unlayered preflight in production](https://github.com/tailwindlabs/tailwindcss/issues/19853) -- preflight duplication is a known issue (MEDIUM confidence)
- [Nuxt UI Issue #2455: compile export not found](https://github.com/nuxt/ui/issues/2455) -- v3/v4 version conflict evidence (HIGH confidence)
- [@tailwindcss/node source code](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/%40tailwindcss-node/src/compile.ts) -- loadStylesheet/loadModule implementation using enhanced-resolve (HIGH confidence)
- [Tailwind CSS v4 Preflight docs](https://tailwindcss.com/docs/preflight) -- layer structure: theme, base, components, utilities (HIGH confidence)

---
*Pitfalls research for: Tailwind v4 compile() migration in vanillify*
*Researched: 2026-04-05*
