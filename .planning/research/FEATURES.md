# Feature Research

**Domain:** Tailwind CSS to vanilla CSS converter library/CLI
**Researched:** 2026-04-04
**Confidence:** MEDIUM

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Standard utility class resolution | Core purpose of the tool — flex, grid, spacing, color, typography must all produce correct CSS | LOW | UnoCSS `createGenerator` handles this via preset-wind4 |
| Variant/pseudo-class conversion | `hover:`, `focus:`, `active:`, `disabled:` are ubiquitous in real Tailwind usage — any converter missing these is unusable | MEDIUM | Outputs `:hover`, `:focus` etc. pseudo-selectors in generated CSS |
| Responsive breakpoint conversion | `sm:`, `md:`, `lg:`, `xl:`, `2xl:` are standard in every Tailwind project | MEDIUM | Outputs `@media` rules; UnoCSS handles via preset variants |
| JSX/TSX class attribute extraction | Target users write React/Qwik/Solid components — HTML-only extraction is a non-starter | MEDIUM | oxc-parser traverses AST to find `className` and `class` attributes |
| Programmatic API | Library consumers want `import { convert } from 'vanillify'` — no CLI-only tools | LOW | Returns `{ css: string, component: string }` in-memory |
| CLI interface | Build pipeline integration requires a command to run — can't require scripting the API | LOW | Wraps the API; writes files to disk |
| Readable generated CSS | Output CSS must be legible for debugging and post-processing — minified-only is a dealbreaker | LOW | Formatted output with clear selector/property structure |
| Correct CSS specificity | Generated selectors must not over-specify (avoid `div.node0` when `.node0` works) | LOW | Indexed class names keep specificity predictable |
| Stacked variant handling | `dark:hover:text-white` and similar stacked variants appear in production code | HIGH | UnoCSS nests these; converter must produce valid multi-condition CSS |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AST-based class extraction (oxc-parser) | Eliminates false positives/negatives from regex extraction — gets exact classes from every JSX expression | MEDIUM | No existing Tailwind-to-CSS converter uses proper AST parsing; most use regex or string scanning |
| UnoCSS `createGenerator` engine | Produces accurate CSS from UnoCSS's own generation pipeline rather than hand-rolled lookup tables | MEDIUM | Reference implementation proved this works; avoids "guessing" CSS values |
| Custom variant resolution | `@custom-variant` directives (e.g., `ui-checked`, `ui-disabled`) are common in design systems using Tailwind — no existing tool handles this | HIGH | User provides variant definitions; converter simplifies scoped selectors to descendant selectors for vanilla CSS |
| Indexed class naming by default | Predictable, machine-friendly output (`.node0`, `.node1`) designed for downstream AI post-processing to add semantic names | LOW | Unique positioning for AI-assisted workflows; no other tool targets this use case |
| Framework-agnostic JSX parsing | Works with React, Qwik, Solid, Preact — not tied to one framework's conventions | LOW | oxc-parser handles all JSX/TSX dialects natively |
| In-memory transform API | Returns transformed component string alongside CSS — no disk I/O required | LOW | Enables integration into Vite plugins, build pipelines, code generators |
| Tailwind v4 class support | Most existing converters target Tailwind v3; v4 utilities and syntax are not handled | MEDIUM | UnoCSS preset-wind4 provides this coverage |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Semantic class naming (auto) | Users want `.button-primary` not `.node0` | Requires intent inference — no tool can reliably determine what `.node0` means semantically from structure alone; AI-generated names are often wrong or inconsistent | Provide indexed names as a stable intermediate; document the AI post-processing workflow for teams that want semantic names |
| CSS Modules output | Developers expect CSS Modules for component-scoped styles | Adds framework coupling, import-style decisions, and build configuration complexity to what should be a simple text transform; the reference implementation outputting `.module.css` caused unnecessary scope decisions | Output plain vanilla CSS; callers can rename the file to `.module.css` if needed |
| SCSS/Sass output | Some teams prefer SCSS nesting over flat CSS | Adds a preprocessor dependency for no functional gain — the output CSS is flat by nature (each selector is independent); nesting doesn't add value here | Output valid, flat CSS; works everywhere without preprocessors |
| Watch mode | CI pipelines want to run once; some devs want live refresh | A build-time static converter has no meaningful "change" to watch — the output is deterministic from input | Run the CLI as a build step via existing watchers (Vite, nodemon, tsc --watch) |
| Runtime/JIT conversion | Dynamic class names need runtime resolution | Dynamic classes (`className={isDark ? 'bg-black' : 'bg-white'}`) cannot be statically extracted by definition — supporting them requires a runtime CSS injector, which is a fundamentally different product | Document the static-only constraint clearly; dynamic classes are out of scope |
| Theme block conversion (`@theme`) | Users want to preserve design tokens | Theme values are deeply intertwined with how UnoCSS resolves utility classes — attempting to extract theme to CSS variables creates a secondary resolution layer that duplicates UnoCSS's job | Defer to v2; core conversion first |
| Source maps | Debugging converted CSS back to Tailwind classes | Source maps for CSS-from-className transforms are non-standard (no spec), not supported by browser DevTools CSS source map UI, and have no established format for this use case | Include comments in output CSS noting original class names if traceability is needed |
| HTML/non-JSX file support | Some users have HTML files with Tailwind | oxc-parser is explicitly a JS/TS parser — handling HTML requires a separate parser, different attribute patterns, and different output (no component transform) | Document JSX/TSX scope clearly; HTML is out of scope for v1 |

---

## Feature Dependencies

```
[Programmatic API]
    └──requires──> [Class extraction (oxc-parser)]
                       └──requires──> [JSX/TSX AST traversal]

[CLI]
    └──requires──> [Programmatic API]
                       └──requires──> [CSS generation (UnoCSS createGenerator)]

[Variant conversion (hover:, focus:, etc.)]
    └──requires──> [CSS generation (UnoCSS createGenerator)]
                       └──requires──> [preset-wind4 or preset-wind3]

[Custom variant resolution]
    └──requires──> [CSS generation (UnoCSS createGenerator)]
    └──requires──> [Variant definition parsing]

[Stacked variant handling (dark:hover:)]
    └──requires──> [Variant conversion]
    └──requires──> [Correct CSS generation for compound selectors]

[Responsive breakpoint conversion]
    └──requires──> [CSS generation (UnoCSS createGenerator)]

[Indexed class naming]
    └──enhances──> [Class extraction]
    └──feeds into──> [AI semantic naming (downstream, v2+)]

[Custom variant resolution] ──conflicts with──> [Theme support]
    (both require deep UnoCSS config customization; combining in v1 is risky)
```

### Dependency Notes

- **CLI requires Programmatic API:** CLI is intentionally a thin wrapper; all logic lives in the API so library consumers get the same capabilities as CLI users.
- **CSS generation requires UnoCSS preset:** Without a preset (wind4 for Tailwind v4, wind3 for v3), `createGenerator` produces no output for Tailwind classes — the preset is the rule set.
- **Custom variant resolution requires variant definition parsing:** User must supply `@custom-variant` definitions (e.g., from a CSS file or string); the converter needs to parse these to know how to map variant names to selectors.
- **Stacked variants require correct compound selector output:** `dark:hover:text-white` must produce a valid compound rule — UnoCSS handles this but the extractor must pass the full class string (with colons) to the generator unmodified.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] **Programmatic API** (`convert(source, options) => { css, component }`) — without this, there is no library; CLI and integrations all build on it
- [ ] **AST-based class extraction via oxc-parser** — the core differentiator; regex extraction is unreliable for JSX
- [ ] **UnoCSS `createGenerator` CSS generation** — the other core differentiator; accurate CSS output
- [ ] **Standard utility class coverage** (flex, grid, spacing, color, typography, sizing) — table stakes; missing common classes makes the tool unusable
- [ ] **Variant handling** (hover, focus, active, disabled, responsive breakpoints) — required for real-world code; all existing Tailwind code uses variants
- [ ] **Indexed class naming** (`.node0`, `.node1`) — the defined output format; must be consistent from day one
- [ ] **CLI wrapper** (`npx vanillify <files>`) — required for build pipeline use; validates the API works end-to-end
- [ ] **Custom variant support (opt-in)** — the primary motivating use case is QDS; without this, the tool doesn't solve the actual problem

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **Glob pattern support in CLI** — `vanillify 'src/**/*.tsx'` once single-file works correctly
- [ ] **Stacked variant handling** (`dark:hover:`, `md:focus:`, etc.) — important for production code but can be deferred past initial validation
- [ ] **Tailwind v3 compatibility mode** — some projects are still on v3; preset-wind3 could enable this with minimal extra work
- [ ] **Verbose/debug output** — useful for diagnosing why a class didn't convert; low effort, high value for users

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Theme block conversion (`@theme`)** — complex, risky, the reference implementation showed this is where bugs live; revisit after v1 is stable
- [ ] **Semantic class naming via local AI** — appealing but requires an entirely different workflow (model integration, naming inference); out of scope until indexed naming is validated
- [ ] **Vite plugin** — useful for tight build integration but not needed before the library API is proven
- [ ] **HTML file support** — would require a separate parser path (not oxc-parser); different enough that it's almost a new product

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Programmatic API | HIGH | LOW | P1 |
| AST class extraction (oxc-parser) | HIGH | MEDIUM | P1 |
| UnoCSS createGenerator engine | HIGH | MEDIUM | P1 |
| Standard utility coverage | HIGH | LOW | P1 |
| Variant/pseudo conversion | HIGH | LOW | P1 |
| Responsive breakpoint conversion | HIGH | LOW | P1 |
| Indexed class naming | MEDIUM | LOW | P1 |
| CLI wrapper | HIGH | LOW | P1 |
| Custom variant resolution | HIGH | HIGH | P1 |
| Stacked variant handling | MEDIUM | MEDIUM | P2 |
| Glob support in CLI | MEDIUM | LOW | P2 |
| Tailwind v3 compat mode | MEDIUM | LOW | P2 |
| Verbose/debug output | LOW | LOW | P2 |
| Theme support | HIGH | HIGH | P3 |
| Semantic class naming (AI) | MEDIUM | HIGH | P3 |
| Vite plugin | MEDIUM | MEDIUM | P3 |
| HTML file support | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | tailwind-vanilla (MattLoyeD) | tailwind-v4-to-css-converter (olusegun-kunai) | vanilla_breeze (archived) | Vanillify (this project) |
|---------|------------------------------|-----------------------------------------------|---------------------------|--------------------------|
| Input format | HTML strings | HTML/JSX/TSX/Vue files | HTML markup | JSX/TSX files |
| Parser | String/regex | Regex-based class scanning | Unknown (archived) | oxc-parser (AST) |
| CSS engine | Tailwind's compiler | UnoCSS `createGenerator` | Unknown | UnoCSS `createGenerator` |
| Output format | Vanilla CSS in `<style>` tag | CSS Modules (`.module.css`) | Vanilla CSS | Vanilla CSS |
| Class naming | Prefix-based | Semantic (`div_layout_1`) | Unknown | Indexed (`.node0`) |
| Programmatic API | Yes (`tailwindVanilla()`) | No | No | Yes (primary interface) |
| CLI | Yes (folder-level) | Yes (directory) | No | Yes (file/glob) |
| Custom variants | No | No | No | Yes (opt-in) |
| Tailwind v4 | No | Yes (focus) | No (archived) | Yes |
| Stacked variants | Partial | Partial | Unknown | Yes (via UnoCSS) |
| Responsive | Yes | Yes | Unknown | Yes |
| Framework-agnostic JSX | No (HTML only) | Partial | No | Yes |

**Key observation:** No existing tool combines (1) AST-based parsing, (2) UnoCSS generation engine, (3) custom variant support, and (4) programmatic-first API. The closest is `tailwind-v4-to-css-converter`, which proves the UnoCSS approach but uses regex parsing and outputs CSS Modules — both of which Vanillify improves on.

---

## Sources

- [tailwind-vanilla (GitHub)](https://github.com/mattloyed/tailwind-vanilla) — existing converter, HTML-focused, API design reference
- [tailwind-v4-to-css-converter (GitHub)](https://github.com/olusegun-kunai/tailwind-v4-to-css-converter) — reference implementation for UnoCSS approach
- [vanilla_breeze (GitHub, archived)](https://github.com/thespicyweb/vanilla_breeze) — Tailwind v3 era converter, now archived; creator noted Tailwind v4 "eliminated the need"
- [Tailwind CSS GitHub Discussion #3895](https://github.com/tailwindlabs/tailwindcss/discussions/3895) — user needs: portability, email, component extraction
- [UnoCSS Wind4 Preset docs](https://unocss.dev/presets/wind4) — Tailwind v4 feature coverage, known limitations
- [UnoCSS Tailwind v4 Support Issue #4411](https://github.com/unocss/unocss/issues/4411) — gaps: missing IntelliSense, CSS config file integration not yet done
- [oxc-parser npm](https://www.npmjs.com/package/oxc-parser) / [oxc.rs](https://oxc.rs/docs/learn/architecture/parser) — AST parser capabilities for JSX/TSX
- [Tailwind CSS hover/focus/states docs](https://tailwindcss.com/docs/hover-focus-and-other-states) — variant patterns that must be handled
- [Tailwind @custom-variant docs](https://www.mintlify.com/tailwindlabs/tailwindcss/advanced/custom-variants) — custom variant directive syntax

---

*Feature research for: Tailwind CSS to vanilla CSS converter library/CLI*
*Researched: 2026-04-04*
