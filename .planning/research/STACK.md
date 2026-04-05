# Stack Research

**Domain:** TypeScript library — Tailwind-to-vanilla-CSS converter
**Researched:** 2026-04-04
**Confidence:** MEDIUM-HIGH (core choices HIGH, UnoCSS/Tailwind-v4 gap MEDIUM due to active development)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@unocss/core` | ^66.6.7 | CSS generation engine via `createGenerator` | Programmatic API gives exact CSS output from UnoCSS's generation pipeline. No need to shell out or run a full Tailwind build. The `createGenerator` is async from v0.65.0+, returning `{ css }` from `generate(code)`. This is the only approach that gives _actual_ CSS rather than a lookup table. |
| `@unocss/preset-wind4` | ^66.6.7 | Tailwind v4 utility rules | The official UnoCSS preset that targets Tailwind v4 semantics. Shipped as its own package after being promoted from a PoC (issue #4411 closed April 2025). Current status: "not fully ready yet" per maintainers but core utilities (flex, grid, spacing, colors, variants) work. CSS config file support is still outstanding. |
| `oxc-parser` | ^0.123.0 | JSX/TSX AST parsing | Fastest JS/TS parser available (Rust-powered, used by Rolldown in production). Returns ESTree-compatible AST with `parseSync(filename, sourceText)`. Handles JSX/TSX natively — language inferred from file extension. Exports a `Visitor` class for AST traversal. Production-ready as of 2025. |
| `tsdown` | ^0.21.7 | Library bundler | Spiritual successor to tsup, built on Rolldown (Rust). ESM-first, ~2x faster than tsup for builds, ~8x faster for `.d.ts` generation. Actively maintained by the VoidZero/Vite team. tsup is no longer actively maintained — tsdown is the correct choice for new libraries in 2025. Requires Node 20.19+. |
| `vitest` | ^4.1.2 | Unit testing | Native Vite/Rolldown integration, no config duplication. Vitest 4 (Oct 2025) is the current major — stable Browser Mode, visual regression support. For a pure library (no DOM), setup is minimal: just `vitest.config.ts` with `environment: 'node'`. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@unocss/preset-wind3` | ^66.6.7 | Tailwind v3 utility rules (fallback) | Only if the project needs to also support Tailwind v3 class syntax. Wind4 is not backward-compatible with Wind3 on some theme keys. Ship Wind4 first; add Wind3 as opt-in preset later if demand exists. |
| `@unocss/transformer-directives` | ^66.6.7 | `@apply`, `@screen`, `theme()` directives | Needed if vanillify processes CSS files that use UnoCSS directives. Does NOT support Tailwind v4's `@custom-variant` — that requires the custom variant resolution layer described below. |
| `magic-string` | ^0.30.x | Source map / string mutations | If vanillify needs to track source positions when rewriting JSX. Optional for v1; the transform is in-memory and output positions don't map back to source. Defer until source maps become a requirement. |
| `pathe` | ^2.0.x | Cross-platform path utilities | Preferred over Node's `path` for libraries that may run on non-POSIX systems. Lightweight, drop-in replacement. |
| `citty` | ^0.1.x | CLI argument parsing | From the UnJS/VoidZero ecosystem. Used by tsdown itself and many Vite-adjacent tools. Lightweight, typed, zero-dep. Use for the `npx vanillify <files>` CLI wrapper. |
| `consola` | ^3.x | Terminal output | Structured logging for CLI output. Also from UnJS. Pairs naturally with citty. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `tsdown` | Build (also listed above as core) | `tsdown.config.ts` with `entry: ['./src/index.ts']`, dual ESM+CJS output, `dts: true` for declaration files. |
| `vitest` | Testing (also listed above as core) | `vitest.config.ts`, `environment: 'node'`, `coverage.provider: 'v8'`. |
| `typescript` | Type checking | 5.5+ required for `isolatedDeclarations` which tsdown uses for fast `.d.ts` generation. |
| `@antfu/eslint-config` | Linting | Standard in the Vite/UnoCSS ecosystem. Anthony Fu is a core UnoCSS author — this config is well-maintained and opinionated in the right direction for this project's ecosystem. |
| `oxlint` | Fast linting | Part of the Vite+ toolchain. 50-100x faster than ESLint. Can run alongside ESLint or replace it. Use for CI speed. |

---

## Installation

```bash
# Core runtime dependencies
npm install @unocss/core @unocss/preset-wind4 oxc-parser

# CLI dependencies
npm install citty consola pathe

# Dev dependencies
npm install -D tsdown vitest typescript @antfu/eslint-config oxlint
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `@unocss/core` + `preset-wind4` | Tailwind CSS v4 CLI / `@tailwindcss/postcss` | Tailwind has no programmatic CSS-generation API. You'd have to shell out or write to a temp file. Makes `convert()` a side-effectful process. UnoCSS gives us `generate()` as a pure async function. |
| `@unocss/core` + `preset-wind4` | `@tailwindcss/oxide` (Tailwind v4 Rust engine) | No public programmatic API as of April 2026. Designed to be a build-tool plugin, not a library you call. |
| `oxc-parser` | `@babel/parser` | Babel is significantly slower and larger. oxc-parser is used in Rolldown (production). ESTree-compatible output is functionally equivalent. |
| `oxc-parser` | `@typescript-eslint/typescript-estree` | Slower, more complex setup, large dependency tree. Built for linting not general-purpose AST work. |
| `oxc-parser` | `acorn` + `acorn-jsx` | Acorn has no TypeScript support without additional plugins. Multi-package setup is fragile. |
| `tsdown` | `tsup` | tsup is no longer actively maintained. tsdown is the same DX (similar config) but faster, ESM-first, and on Rolldown which is where the ecosystem is heading. |
| `tsdown` | `unbuild` | unbuild is a solid choice (used by Nuxt) but the VoidZero/Qwik ecosystem standardizing on tsdown makes it the better fit for this project's context. |
| `vitest` | `jest` | Jest has no native ESM support and requires transform setup for TypeScript. Vitest is zero-config for Vite-adjacent projects and is the standard in this ecosystem. |
| `citty` | `commander` / `yargs` | commander and yargs work, but citty is smaller, fully typed, and from the same ecosystem (UnJS). Less setup overhead for a thin CLI wrapper. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Regex-based class extraction** | Misses dynamic class names, template literals, conditional expressions. Fine for simple demos, not for production. The reference implementation (olusegun-kunai/tailwind-v4-to-css-converter) uses regex and produces incorrect output for non-trivial JSX. | `oxc-parser` with `Visitor` traversal of `JSXAttribute` nodes |
| **`tailwind-vanilla` / `@jyotirmay/tailwind-to-css`** | Both use lookup tables / regex. They don't call Tailwind's or UnoCSS's actual generation pipeline. Output will diverge from real Tailwind CSS for any non-trivial utility (especially variants, arbitrary values, custom config). | `@unocss/core` `createGenerator` |
| **`@unocss/preset-wind` (deprecated)** | Soft-deprecated in UnoCSS 66.x with console warnings. Renamed to `preset-wind3`. Will be removed in a future major. | `@unocss/preset-wind4` (or `preset-wind3` explicitly if Tailwind v3 is needed) |
| **`tsup`** | No longer actively maintained. Use is a dead end for new projects. | `tsdown` |
| **Full `unocss` package** | The `unocss` metapackage bundles all presets, Vite plugin, webpack plugin, CLI, etc. It's 10x larger than needed. Vanillify only needs `@unocss/core` + a preset. | `@unocss/core` + `@unocss/preset-wind4` directly |
| **`@unocss/transformer-directives` for `@custom-variant`** | Does not process `@custom-variant` directives from Tailwind v4 CSS. This is confirmed missing from the transformer — it only handles `@apply`, `@screen`, and `theme()`. | Custom variant resolution layer in vanillify (see PROJECT.md: map `@custom-variant` definitions to UnoCSS `variants` config programmatically) |

---

## Stack Patterns by Variant

**For the programmatic API (`import { convert } from 'vanillify'`):**
- Export pure async functions — no side effects, no file I/O
- `createGenerator` is called once and reused (it's expensive to instantiate)
- Pass class names extracted by oxc-parser directly to `generator.generate()`
- Return `{ css: string, html: string }` where html has class names replaced with `.node0`, `.node1`, etc.

**For the CLI wrapper (`npx vanillify <files>`):**
- Thin shell around the programmatic API
- Uses `citty` for arg parsing, `consola` for output
- Handles glob expansion, file reading, writing output
- Does NOT duplicate conversion logic — imports directly from the library

**For custom variant support:**
- User provides `@custom-variant` definitions (either a CSS string or a parsed object)
- Vanillify parses these and constructs UnoCSS `variants` entries programmatically before calling `createGenerator`
- This is the custom layer on top of UnoCSS — it's not something UnoCSS handles natively for Tailwind v4's `@custom-variant` syntax

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@unocss/core@^66.x` | `@unocss/preset-wind4@^66.x` | Must match major — all `@unocss/*` packages are versioned together |
| `oxc-parser@^0.123.x` | Node.js 20+ | Ships platform-specific native binaries; no special setup needed via npm |
| `tsdown@^0.21.x` | Node.js 20.19+ | Hard requirement per tsdown docs |
| `vitest@^4.x` | `vite@^6.x` | Vitest 4 targets Vite 6; peer dependency |
| `typescript@^5.5+` | `tsdown@^0.21.x` | 5.5+ required for `isolatedDeclarations` used by tsdown's fast DTS mode |

---

## Key Technical Risk: UnoCSS preset-wind4 Completeness

**Confidence: MEDIUM** — This is the most important unknown.

`preset-wind4` was promoted from a PoC to an official package in April 2025 (issue #4411). The maintainer explicitly said it is "not fully ready yet" as of that date. The outstanding item is CSS configuration file support (`@theme`, `@config`).

**What this means for vanillify:**
- Standard Tailwind v4 utilities (flex, grid, spacing, colors, responsive prefixes, pseudo-class variants like `hover:`, `focus:`) — these work. HIGH confidence.
- `@theme` blocks — NOT supported by `preset-wind4`. This is why PROJECT.md explicitly excludes theme support in v1.
- `@custom-variant` — NOT processed by UnoCSS at all (transformer-directives confirmed missing). Vanillify needs its own layer. This is already captured as a feature requirement.
- Arbitrary values (`bg-[#ff0000]`, `w-[200px]`) — These are UnoCSS-native via the `@unocss/preset-mini` arbitrary value system which `preset-wind4` inherits. MEDIUM confidence they work correctly.

**Recommendation:** Build vanillify's test suite against the reference set of Tailwind v4 utilities early (Phase 1) to surface any `preset-wind4` gaps before deeper features are built on assumptions.

---

## Existing Tool Landscape

The Tailwind-to-CSS converter space has two approaches, both inferior to vanillify's approach:

| Tool | Approach | Gap |
|------|----------|-----|
| `tailwind-vanilla` (MattLoyeD) | HTML string parsing + lookup table | No Tailwind v4 support; doesn't handle variants or arbitrary values |
| `@jyotirmay/tailwind-to-css` | Lookup table, `convert(html)` API | Same class of problem: diverges from real Tailwind output |
| Online converters (folge.me, etc.) | Web-based regex mapping | Not programmable; not accurate for complex utilities |
| olusegun-kunai reference impl | UnoCSS `createGenerator` + regex class extraction | Correct CSS engine, incorrect extraction. Vanillify improves extraction with oxc-parser. |

The gap vanillify fills: **correct CSS engine (UnoCSS `createGenerator`) + correct extraction (oxc-parser AST) + custom variant resolution**. No existing npm package does all three.

---

## Sources

- [UnoCSS Core API — unocss.dev/tools/core](https://unocss.dev/tools/core) — `createGenerator`, `generate()` API, version 66.6.7
- [UnoCSS preset-wind4 — unocss.dev/presets/wind4](https://unocss.dev/presets/wind4) — Tailwind v4 preset docs
- [Tailwind 4 Support Plan — github.com/unocss/unocss/issues/4411](https://github.com/unocss/unocss/issues/4411) — completion status, outstanding items (MEDIUM confidence — issue closed April 2025 but "not fully ready")
- [UnoCSS Tailwind v4 Discussion — github.com/unocss/unocss/discussions/4288](https://github.com/unocss/unocss/discussions/4288) — maintainer quotes on scope
- [UnoCSS transformer-directives — unocss.dev/transformers/directives](https://unocss.dev/transformers/directives) — confirmed: NO `@custom-variant` support
- [oxc-parser npm — npmjs.com/package/oxc-parser](https://www.npmjs.com/package/oxc-parser) — version 0.123.0, `parseSync` API
- [Oxc Parser guide — oxc.rs/docs/guide/usage/parser.html](https://oxc.rs/docs/guide/usage/parser.html) — `parseSync`, `Visitor` class, ESTree compatibility
- [tsdown Introduction — tsdown.dev/guide/](https://tsdown.dev/guide/) — version 0.21.7, Node 20.19+ requirement
- [tsdown vs tsup — alan.norbauer.com/articles/tsdown-bundler/](https://alan.norbauer.com/articles/tsdown-bundler/) — ESM-first, DTS speed, migration rationale
- [Vitest 4.0 announcement — vitest.dev/blog/vitest-4](https://vitest.dev/blog/vitest-4) — version 4.1.2 current
- [Vite+ announcement — voidzero.dev/posts/announcing-vite-plus](https://voidzero.dev/posts/announcing-vite-plus) — ecosystem context (tsdown, vitest, oxlint unified)

---

*Stack research for: Tailwind-to-vanilla-CSS converter library (vanillify)*
*Researched: 2026-04-04*
