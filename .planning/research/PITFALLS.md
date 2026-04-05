# Pitfalls Research

**Domain:** Tailwind CSS to Vanilla CSS converter library (UnoCSS `createGenerator` + `oxc-parser`)
**Researched:** 2026-04-04
**Confidence:** MEDIUM — core pitfalls are well-evidenced from UnoCSS issues, Tailwind docs, and reference implementation analysis. Some UnoCSS internals rely on source inspection rather than official API docs.

---

## Critical Pitfalls

### Pitfall 1: UnoCSS preset-wind4 is not feature-complete against Tailwind v4

**What goes wrong:**
Developers assume `@unocss/preset-wind4` is a drop-in replacement for Tailwind v4. It is not. As of early 2025 the preset explicitly tracks known gaps: missing `(--custom-property)` shorthand syntax (e.g. `animation-(--blink)` instead of `animation-[var(--blink)]`), missing `pointer-coarse:` variant, incomplete CSS config file integration, and theme key renames (`fontFamily` → `font`). The maintainer stated "preset-wind4 is not fully ready yet" in March 2025.

**Why it happens:**
UnoCSS markets preset-wind4 as Tailwind v4 compatible, and it covers the vast majority of utilities. The gaps are in newer v4-specific syntax and edge-case utilities (`wrap-anywhere` overflow-wrap shorthand, `color-scheme` utility) that were added in Tailwind v4's ground-up rewrite.

**How to avoid:**
Build a test suite using Tailwind v4's own documentation examples as ground truth. For each class category (color, spacing, typography, layout, variants), generate CSS with both Tailwind v4 and UnoCSS preset-wind4 and compare output. Document any class that silently produces no output or wrong output. Ship a `--strict` mode flag that errors on unmatched classes rather than silently dropping them.

**Warning signs:**
- A class is passed to `generator.generate()` and the returned CSS is empty or missing the property
- Color utilities use unexpected `oklch()` color values where you expected hex/rgb (UnoCSS preset-wind4 defaults to oklch color model)
- `(--custom-property)` shorthand syntax produces no CSS

**Phase to address:**
Core engine phase — must have a class-coverage test matrix before shipping. Failing classes must be documented in the library's README.

---

### Pitfall 2: Dynamic and conditional class names are structurally unresolvable

**What goes wrong:**
`oxc-parser` gives you a precise AST, but a significant portion of real-world Tailwind usage is dynamic: `className={condition ? 'bg-red-500' : 'bg-green-500'}`, `className={cn('flex', isActive && 'font-bold')}`, template literals with variable interpolation like `` className={`text-${size}`} ``. These patterns cannot be resolved statically. If vanillify silently drops them, users get incomplete CSS output with no indication of what was missed.

**Why it happens:**
The appeal of oxc-parser is accurate class extraction, which creates an implicit expectation of completeness. But AST-based extraction can only extract what is statically determinable. Runtime-conditional and interpolated class fragments are fundamentally opaque at parse time.

**How to avoid:**
Categorize extracted nodes explicitly: `static` (string literal, fully extractable), `dynamic` (conditional expression, logical AND, `clsx`/`cn` call, template literal with variables). For dynamic nodes, extract the statically-determinable fragments (e.g. both branches of a ternary if they are string literals) and emit a warning for anything with runtime-variable parts. Never silently succeed when classes are partially unresolvable.

**Warning signs:**
- Component files use `clsx`, `cn`, `classnames`, or `twMerge` — all conditional at runtime
- Template literals appear in `className` attributes: `` `text-${color}` ``
- Logical expressions: `isBold && 'font-bold'`
- Object syntax: `{ 'bg-red': isError, 'bg-green': isSuccess }`

**Phase to address:**
oxc-parser integration phase. The extraction layer must implement and test each dynamic pattern variant, clearly distinguishing what it can and cannot handle.

---

### Pitfall 3: `@custom-variant` is a Tailwind CSS directive, not a UnoCSS directive

**What goes wrong:**
The project requirement allows users to pass `@custom-variant` definitions so vanillify can resolve custom variants like `ui-checked:`. However `@custom-variant` is a Tailwind v4 CSS directive — UnoCSS uses a JavaScript-based variant configuration system, not CSS directives. `createGenerator` cannot natively parse a `@custom-variant` CSS block and use it to resolve custom variant prefixes. Attempting to pass raw `@custom-variant` CSS to `createGenerator` will silently fail to register the variant.

**Why it happens:**
The project's reference implementation proved the UnoCSS approach works for standard utilities, which creates confidence that the same engine handles everything. Custom variants require a separate translation layer that maps Tailwind's CSS-directive variant definitions to UnoCSS's JavaScript variant function format.

**How to avoid:**
Build an explicit `@custom-variant` parser that reads the CSS directive syntax and translates it to UnoCSS variant config. The translation for QDS-style attribute selectors (`[ui-checked]`, `[ui-qds-scope][ui-checked] > &`) to simplified descendant selectors is a lossy transform — document what is simplified and why. Provide the programmatic API's `customVariants` option as a typed object (`Record<string, string>`) rather than accepting raw CSS strings.

**Warning signs:**
- Custom variant classes (e.g. `ui-checked:bg-blue-500`) produce no CSS output at all
- No error is thrown when an unknown variant prefix is encountered
- The generated CSS is valid but missing entire `ui-*:` rule blocks

**Phase to address:**
Custom variant support phase — this is its own phase, not bundled with standard utility handling. The translation layer needs isolated testing with QDS's actual `@custom-variant` definitions.

---

### Pitfall 4: Stacked variants produce complex selectors that must preserve specificity semantics

**What goes wrong:**
Tailwind allows stacking variants: `dark:md:hover:bg-fuchsia-600`. Each layer wraps the previous in its selector or media query. The generated CSS must maintain the same cascade order and specificity as Tailwind's own output. Common errors: wrong nesting order (hover inside media query vs media query inside hover), missing `@media` wrapper for responsive variants, incorrect `&` placement in arbitrary variants like `[&>*]:rounded-lg`.

**Why it happens:**
UnoCSS's `createGenerator` handles variant stacking internally, so vanillify gets this right for free when UnoCSS supports the variant. The pitfall emerges when vanillify adds its own variant resolution (custom variants, see Pitfall 3), bypassing UnoCSS's well-tested stacking logic and potentially producing selector output that differs from what Tailwind would generate.

**How to avoid:**
For any custom variant resolution built outside UnoCSS, write explicit tests comparing selector output against Tailwind's expected output for stacked variants. The `&` character in arbitrary variants must be preserved correctly — it substitutes the generated class selector. `group-*` and `peer-*` variants generate descendant and sibling selectors respectively; these require ancestor elements to carry a specific class (`.group`, `.peer`) — document this requirement clearly since vanilla CSS output cannot add that ancestor class automatically.

**Warning signs:**
- `group-hover:` and `peer-*:` classes appear in input but the user's page has no `.group`/`.peer` ancestor elements
- `dark:` variant outputs without a `@media (prefers-color-scheme: dark)` wrapper or a `.dark` ancestor selector
- `md:hover:` produces a plain `:hover` selector without the `@media (min-width: 768px)` wrapper

**Phase to address:**
Variant handling phase. Test matrix should include: simple variants, responsive variants, pseudo-element variants, stacked variants (2+ layers), and arbitrary variants with `&`.

---

### Pitfall 5: Arbitrary values with special characters require correct CSS escaping

**What goes wrong:**
Tailwind arbitrary values like `text-[#ff0000]`, `w-[calc(100%-2rem)]`, `bg-[url('/img/bg.png')]`, `[&>*]:text-sm` contain characters that are valid in the class-name context but require escaping in the CSS selector. A converter that naively uses the class string as the selector will produce invalid CSS (`#` unescaped, `/` unescaped, spaces unescaped). UnoCSS handles this internally but only for classes it recognizes — unrecognized or malformed arbitrary values may produce broken selectors or silently return empty CSS.

**Why it happens:**
Arbitrary values were designed to be written in HTML, not CSS. The `text-[#ff0000]` class name needs the `#` escaped as `\#` in CSS. Tailwind v4 also introduced the `(--custom-property)` shorthand which UnoCSS preset-wind4 does not yet support — users writing this syntax get no CSS output.

**How to avoid:**
Rely on UnoCSS's own escaping pipeline — pass arbitrary-value classes through `createGenerator` unchanged and let UnoCSS escape correctly. Do not post-process the generated CSS selectors. Add test coverage for: color values (`text-[#ff0000]`), lengths with operators (`w-[calc(100%-2rem)]`), CSS variables (`text-[var(--brand)]`), URL values (`bg-[url('/img')]`), and data attributes (`data-[active]:bg-blue-500`).

**Warning signs:**
- CSS output contains unescaped `#` characters in selectors
- `bg-[url(...)]` classes produce no CSS output
- Arbitrary variant selectors like `[&:nth-child(2)]:` produce malformed CSS

**Phase to address:**
Core engine phase. Arbitrary value escaping must be validated in the initial test suite.

---

### Pitfall 6: Indexed class names create specificity equivalence — insertion order determines winning rule

**What goes wrong:**
Vanillify generates `.node0`, `.node1`, etc. as selectors. All have specificity `(0, 1, 0)` — single class. If two generated rules apply to the same element and conflict (e.g. `flex` and `block` both applied via different indexed selectors on the same element), the last rule in the CSS file wins. The class application order in HTML (`.node0 .node1`) does not determine which style wins — CSS source order does. Users applying multiple utility classes to one element may see unexpected cascade behavior.

**Why it happens:**
In Tailwind, the CSS is all specificity-equal and source-order is controlled. With indexed selectors, vanillify has the same CSS-order control, but the user's component may have multiple indexed classes that conflict and there is no merge step. Real Tailwind behavior: `tailwind-merge` or `twMerge` is used to remove conflicting classes before rendering. The converter has no equivalent step.

**How to avoid:**
Document clearly that indexed class names do not resolve conflicting utility classes — users must ensure they do not apply conflicting utilities to the same element if they want predictable results. Consider emitting a warning when two extracted classes from the same JSX element are known to conflict (e.g. both set `display`). Alternatively, emit CSS in the same order that UnoCSS's own layer system would (UnoCSS sorts by layer: preflights < default < shortcuts).

**Warning signs:**
- A component has both `flex` and `grid` applied — only one should win
- Users report that some styles "aren't applying" even though the CSS is generated correctly
- Generated CSS has duplicate properties in different indexed rules for the same element

**Phase to address:**
Class naming and output phase. The limitation must be documented; a conflict-detection warning is a "nice to have" for a later phase.

---

### Pitfall 7: UnoCSS `generate()` input is source code, not a class list — misuse breaks extraction

**What goes wrong:**
`generator.generate(input)` expects source code (HTML, JSX, etc.) as a string, not a space-separated list of class names. The generator runs extractors over the input to find utility tokens. If you pass `"flex bg-red-500 hover:text-white"` as a bare string instead of wrapping it in a realistic code fragment, the extractors may not recognize the tokens depending on how the extractor is configured, and may return empty CSS. Conversely, if you pass full JSX source, the extractor finds class names correctly but you also get CSS for any utility-like strings that appear in non-className contexts (comments, strings, data).

**Why it happens:**
The UnoCSS API is designed for build-tool integration, not for "give me CSS for these classes." There is no official `generator.generateFromClasses(classArray)` method. Developers using `createGenerator` programmatically often pass class lists directly, assuming extractors will work on bare strings. Some extractors do match bare strings, but this is an implementation detail, not a guaranteed API contract.

**How to avoid:**
Pass the full source code from oxc-parser's file content, or construct a minimal HTML wrapper (e.g. `<div class="...extracted classes...">`) to pass to `generate()`. Validate that the returned CSS is non-empty for known-valid classes in unit tests. Use the `safelist` configuration option for classes that are known to be needed but might not appear in source code (e.g., dynamically-resolved classes you've whitelisted).

**Warning signs:**
- `generator.generate(classList.join(' '))` returns empty CSS
- Removing the JSX wrapper around class strings causes CSS to disappear
- Classes that appear in JSX comments accidentally generate CSS

**Phase to address:**
Core engine / UnoCSS integration phase — validate the exact `generate()` input contract in early spike work before building the full extraction pipeline.

---

### Pitfall 8: UnoCSS `generate()` caches by input — state leak in long-running programmatic use

**What goes wrong:**
The UnoCSS generator maintains an internal cache. In a CLI tool that processes one file per run, this is fine. In the programmatic API used as a library (long-lived process, processing many components), the cache may accumulate state across calls. If the generator is shared between multiple `convert()` calls with different configurations (e.g. different custom variants per file), cached results from one call may pollute another, producing incorrect CSS for subsequent calls.

**Why it happens:**
UnoCSS is designed for build-tool integration where the generator is initialized once per build with a fixed configuration. Vanillify's programmatic API invites library users to call `convert()` repeatedly with varying inputs in the same process.

**How to avoid:**
Create a fresh generator instance per conversion call, or implement a `reset()` cycle between calls if the generator exposes one. If performance is a concern, create one generator per unique configuration object (memoize by config identity). Document in the API that the generator should not be shared across calls with different custom variant configurations.

**Warning signs:**
- Calling `convert()` twice on different files produces CSS that bleeds utilities from the first file into the second
- Running in watch mode accumulates unexpected CSS rules over time
- Tests pass in isolation but fail when run together in the same process

**Phase to address:**
Programmatic API design phase. The isolation contract must be specified before the API is published.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Regex-based class extraction instead of full AST traversal | Faster to implement | Misses classes in JSX expressions, breaks on unusual whitespace, can't distinguish className from other attributes | Never — the reference implementation already proved this is unreliable |
| Single generator instance shared across all `convert()` calls | Less instantiation overhead | Cache pollution in library use, incorrect output for sequential calls | Only in CLI mode where process exits after each run |
| Silently dropping unrecognized classes | Simpler API, no error surface | Users get incomplete CSS with no indication something was missed | Never — must emit warnings |
| Treating UnoCSS output CSS as stable and not writing a comparison test suite | Saves initial test-writing time | Any UnoCSS preset-wind4 update can silently change CSS output, breaking consumers | Never — a snapshot test suite is essential |
| Skipping arbitrary value escaping tests | Faster initial development | Arbitrary-value classes are valid Tailwind but produce broken CSS selectors without proper escaping | Never for arbitrary values with `#`, `/`, `(`, `)` |
| Using regex to strip `@layer` wrappers from UnoCSS output | Simple post-processing | UnoCSS may change its layer structure between versions; regex breaks on any structural change | Only as a temporary measure with a version pin |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `oxc-parser` JSX parsing | Forgetting to pass `{ lang: 'tsx' }` option for `.tsx` files; parser defaults to JS mode | Check file extension and pass the correct `lang` option (`jsx`, `tsx`, `ts`, `js`) explicitly |
| `oxc-parser` AST traversal | Walking only `JSXAttribute` nodes and extracting only `StringLiteral` values for `className` | Also handle `JSXExpressionContainer` → extract string literals from conditional expressions, logical AND expressions, and `ArrayExpression` elements (for array-style className) |
| UnoCSS `createGenerator` with preset-wind4 | Passing no preset and expecting Tailwind utilities to work — `@unocss/core` has no built-in rules | Always pass `presetWind4()` (or `presetWind3()`) in the presets array |
| UnoCSS generate with v4 CSS variables | Expecting plain hex values in generated CSS — preset-wind4 uses `oklch()` for colors | Accept oklch output or configure the generator to use a specific color model; document this behavior to users |
| Custom variant resolution | Passing Tailwind's `@custom-variant` CSS syntax directly to `createGenerator` | Parse `@custom-variant` blocks and translate to UnoCSS's JavaScript variant format before instantiating the generator |
| `tsdown` build output | Building in CJS only and failing for ESM consumers | Configure `tsdown` to emit both ESM and CJS; `oxc-parser` and UnoCSS are ESM-first |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Instantiating a new UnoCSS generator for every class string instead of per file | Extremely slow processing of large component libraries | Instantiate once per `convert()` call; reuse within the call | At ~50+ files in a single CLI run |
| Re-parsing the same file with oxc-parser multiple times during a single conversion | Slow CLI on large files | Parse once, pass AST to all extraction passes | Files >500 LOC |
| Accumulating all generated CSS in memory before writing | Memory spike for very large projects | Stream or write CSS incrementally when using CLI mode | Projects with >1000 components |
| UnoCSS generator cache growing unbounded in library/watch mode | Memory growth over time in long-running processes | Reset or re-create generator between logical batch boundaries | Processes running >30 minutes or processing >10k files |

---

## "Looks Done But Isn't" Checklist

- [ ] **Variant handling:** Simple `hover:` and `focus:` work, but stacked variants (`dark:md:hover:`), pseudo-elements (`before:`, `after:`), and arbitrary variants (`[&>*]:`) are untested — verify each category has a passing test
- [ ] **Arbitrary values:** `text-[#ff0000]` passes and `w-[calc(100%-2rem)]` passes, but `bg-[url('/img')]`, `text-[var(--brand)]`, and `data-[active]:bg-blue` are untested — verify CSS selector escaping for each special character type
- [ ] **Custom variants:** The happy path (`ui-checked:bg-blue-500`) generates CSS, but stacked custom variants (`ui-checked:hover:bg-blue`) and custom variants combined with responsive variants (`md:ui-checked:bg-blue`) are untested
- [ ] **oxc-parser extraction completeness:** Static string literals work, but ternary expressions, `clsx()`/`cn()` calls, template literals, and object syntax `{ 'class': condition }` have not been tested — verify what is extracted and what emits a warning
- [ ] **CLI output:** The file is written and the CSS is correct, but the original JSX file still has the old Tailwind class names — verify the component transformation (class replacement) is part of CLI mode output
- [ ] **Empty input:** Passing a file with no Tailwind classes produces an empty CSS file gracefully (not an error or an empty `.node0 {}` rule block)
- [ ] **CSS is valid:** Generated CSS parses without errors in a real browser — run at least one generated output through a CSS validator or browser devtools

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| UnoCSS preset-wind4 gap discovered post-ship | MEDIUM | Add the missing class to a `safelist` with a hardcoded CSS fallback; document as known limitation; file an upstream UnoCSS issue |
| Dynamic class extraction produces wrong/missing CSS | LOW | Add a warning in output; user manually adds missing classes to a `safelist` option passed to `convert()` |
| `@custom-variant` translation produces wrong selectors | MEDIUM | Expose a `customVariants` escape hatch that accepts raw CSS selector strings instead of parsed definitions; user provides the exact selector they want |
| CSS escaping bug breaks arbitrary value classes | HIGH | Audit all generated CSS for selector validity; patch escaping logic; regenerate all affected output; likely requires a patch release |
| Generator cache leaks state across API calls | LOW | Add a `reset()` call or re-instantiate the generator; issue is isolated to long-running processes |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| UnoCSS preset-wind4 feature gaps | Core engine / UnoCSS integration spike | Test matrix: generate CSS for all Tailwind v4 utility categories; compare against known-good output |
| Dynamic class names unresolvable | oxc-parser extraction phase | Verify warnings are emitted for ternary, `clsx`, template literals; no silent omissions |
| `@custom-variant` translation layer | Custom variant support phase | End-to-end test: QDS `ui-checked` variant produces correct descendant selector in output CSS |
| Stacked variant selector correctness | Variant handling phase | Test: `dark:md:hover:bg-fuchsia-600` produces `@media (min-width: 768px) { .nodeX:hover { ... } }` inside `@media (prefers-color-scheme: dark)` or `.dark` selector |
| Arbitrary value CSS escaping | Core engine phase (alongside basic utilities) | Test: `text-[#ff0000]` produces `.nodeX { color: #ff0000; }` with valid selector |
| Indexed class specificity / cascade order | Class naming and output phase | Document behavior; optionally add conflict detection warning |
| `generate()` input contract | UnoCSS integration spike (first phase) | Test: bare class list input vs. JSX-wrapped input; confirm which produces correct output |
| Generator cache isolation | Programmatic API design phase | Test: call `convert()` twice sequentially; CSS from call 1 does not appear in call 2 output |

---

## Sources

- [UnoCSS Tailwind v4 Support Plan — Issue #4411](https://github.com/unocss/unocss/issues/4411)
- [UnoCSS Tailwind v4 Discussion — #4288](https://github.com/unocss/unocss/discussions/4288)
- [UnoCSS preset-wind4 documentation](https://unocss.dev/presets/wind4)
- [UnoCSS Core / createGenerator documentation](https://unocss.dev/tools/core)
- [UnoCSS Extracting documentation](https://unocss.dev/guide/extracting)
- [UnoCSS Layers documentation](https://unocss.dev/config/layers)
- [UnoCSS DeepWiki architecture reference](https://deepwiki.com/unocss/unocss)
- [Tailwind CSS Hover, focus, and other states](https://tailwindcss.com/docs/hover-focus-and-other-states)
- [Tailwind CSS Arbitrary values — Codevup v4 breaking changes](https://codevup.com/issues/2025-10-01-tailwind-css-v4-arbitrary-values-breaking-changes/)
- [oxc-parser npm](https://www.npmjs.com/package/oxc-parser)
- [OXC Parser architecture](https://oxc.rs/docs/learn/architecture/parser)
- [Tailwind v4 @custom-variant and @variant directives — DeepWiki](https://deepwiki.com/tlq5l/tailwindcss-v4-skill/2.4-the-@variant-and-@custom-variant-directives)
- [UnoCSS wrap-anywhere missing utility — Issue #4804](https://github.com/unocss/unocss/issues/4804)
- [Reference implementation: tailwind-v4-to-css-converter](https://github.com/olusegun-kunai/tailwind-v4-to-css-converter)

---
*Pitfalls research for: Tailwind CSS to Vanilla CSS converter (vanillify)*
*Researched: 2026-04-04*
