# Vanillify

## What This Is

A Tailwind CSS to vanilla CSS converter library with CLI. It uses UnoCSS's `createGenerator` as the CSS generation engine and `oxc-parser` for proper AST-based class extraction from JSX/TSX files. Unlike existing converters that rely on pattern matching, vanillify gets exact CSS output from UnoCSS's generation pipeline — making it fundamentally more stable and reliable.

## Core Value

Accurate, reliable conversion of Tailwind classes to vanilla CSS — powered by UnoCSS's `createGenerator` which gives us the actual CSS rather than guessing at it.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Programmatic API: `import { convert } from 'vanillify'` — returns CSS string + transformed component in-memory
- [ ] CLI wrapper: `npx vanillify <files>` — writes converted files to disk
- [ ] AST-based class extraction using `oxc-parser` (not regex)
- [ ] UnoCSS `createGenerator` as the CSS generation engine
- [ ] Indexed class naming for generated selectors (`.node0`, `.node1`, etc.)
- [ ] Handle standard Tailwind v4 utilities (flex, grid, colors, spacing, etc.)
- [ ] Handle variant prefixes (hover:, focus:, etc.) converting to proper pseudo-selectors
- [ ] Opt-in custom variant resolution: allow users to pass `@custom-variant` definitions (e.g. from a CSS file) so the converter can resolve custom variants like `ui-checked`, `ui-disabled` to simplified descendant selectors in vanilla CSS
- [ ] Framework-agnostic JSX/TSX parsing (works with any framework, tested against Qwik examples)

### Out of Scope

- Theme support (`@theme` block conversion) — complexity not justified for v1, revisit later
- Semantic class naming (future: local AI model integration for naming)
- CSS Modules output format — vanilla CSS only for v1
- Runtime/JIT conversion — this is a build-time/static tool

## Context

- **Reference implementation:** [tailwind-v4-to-css-converter](https://github.com/olusegun-kunai/tailwind-v4-to-css-converter) (typescript-converter branch) — proved the UnoCSS `createGenerator` approach works. Vanillify improves on it with proper AST parsing (oxc-parser vs regex), cleaner API design, and custom variant support.
- **Primary use case:** QDS (Qwik Design System) docs — write component examples in Tailwind, auto-generate vanilla CSS versions for the main docs. The indexed class names (`.node0`, `.node1`) are designed to be easy for downstream AI workflows to post-process with semantic names.
- **Secondary use case:** Project migration — convert a Tailwind-based project to vanilla CSS.
- **QDS custom variants:** The `@qds.dev/ui/tailwind` package defines `@custom-variant` directives like `ui-checked`, `ui-mixed`, `ui-disabled` that use attribute selectors (`[ui-checked]`, `[ui-qds-scope][ui-checked] > &`). In vanilla CSS output, these simplify to descendant selectors — the complex scoping is unnecessary outside Tailwind's processing.
- **Toolchain:** vite+ ecosystem — `tsdown` for building, `vitest` for testing, `vite-plus` for config. Follows [QwikDev/cli](https://github.com/QwikDev/cli) project structure patterns.
- **Key technical question:** Whether UnoCSS's `createGenerator` can handle Tailwind v4's `@custom-variant` directive natively, or if vanillify needs a custom variant resolution layer. This is a research item.

## Constraints

- **Tech stack**: vite+ toolchain (tsdown, vitest, vite-plus), oxc-parser, UnoCSS — no other parsers or CSS engines
- **Node.js**: Target modern Node.js (v20+)
- **Output format**: Vanilla CSS only (not CSS Modules, not SCSS, not PostCSS)
- **Class naming**: Indexed only (`.node0`, `.node1`) — no semantic naming in v1

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| UnoCSS `createGenerator` over Tailwind CLI | Gives us programmatic access to CSS generation, no need to shell out or run full Tailwind build | — Pending |
| `oxc-parser` over regex-based parsing | Proper AST means correct class extraction from any JSX/TSX, handles edge cases the regex approach misses | — Pending |
| Indexed class names as default | Simple, predictable, easy for downstream tooling (AI naming) to post-process | — Pending |
| No theme support in v1 | The reference implementation's theme handling was problematic; deferring to get core conversion right first | — Pending |
| Custom variants as descendant selectors | QDS's scoped attribute variants (`[ui-qds-scope][ui-checked] > &`) simplify to descendant selectors in vanilla CSS since scoping is unnecessary | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-04 after initialization*
