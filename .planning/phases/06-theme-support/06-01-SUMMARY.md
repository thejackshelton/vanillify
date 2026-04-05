---
phase: 06-theme-support
plan: 01
subsystem: theme
tags: [tdd, parser, mapper, theme, css-variables]
dependency_graph:
  requires: []
  provides: [parseThemeCss, mapToThemeConfig, ThemeDeclaration, ThemeMapResult, themeCss-option]
  affects: [src/types.ts]
tech_stack:
  added: []
  patterns: [pure-function-modules, last-wins-dedup, longest-prefix-match, tdd-red-green]
key_files:
  created:
    - src/theme/types.ts
    - src/theme/parser.ts
    - src/theme/parser.test.ts
    - src/theme/mapper.ts
    - src/theme/mapper.test.ts
  modified:
    - src/types.ts
decisions:
  - "@theme parser uses regex extraction, not a CSS parser library -- consistent with project constraint"
  - "Namespace mapper uses sorted-by-length prefix array for correct --font-weight- vs --font- matching"
  - "Unknown namespaces pass through as camelCase keys with warning (THEME-07 compliance)"
metrics:
  duration: 142s
  completed: "2026-04-05"
  tasks: 2
  files: 6
---

# Phase 6 Plan 1: Theme Parser & Namespace Mapper Summary

Theme @theme CSS parser and namespace-to-UnoCSS mapper with full TDD coverage -- pure functions extracting CSS variable declarations and translating 17 verified Tailwind v4 namespaces to UnoCSS theme config keys.

## Tasks Completed

### Task 1: Theme types and @theme CSS parser (TDD)

- **Commit:** f93f0ca
- Created `src/theme/types.ts` with ThemeDeclaration, ParseThemeResult, ThemeMapResult interfaces
- Created `src/theme/parser.ts` implementing `parseThemeCss()` -- handles @theme wrapper, bare declarations, CSS comments, duplicates (last-wins), malformed input (warns), complex values (oklch), empty input, and @theme reset (warns + skips)
- Updated `src/types.ts`: added `themeCss?: string` to ConvertOptions, expanded Warning type union with `theme-parse-error`, `unknown-theme-namespace`, `unsupported-theme-reset`
- 9 passing tests

### Task 2: Namespace mapper from CSS vars to UnoCSS theme keys (TDD)

- **Commit:** 5669695
- Created `src/theme/mapper.ts` implementing `mapToThemeConfig()` with exported `NAMESPACE_MAP` constant
- 17 namespace mappings with longest-prefix-first sorting
- Color shade nesting (brand-500 -> colors.brand.500)
- Text fontSize/lineHeight special case
- Bare namespace DEFAULT keys (--spacing -> spacing.DEFAULT)
- Unknown namespaces warn but pass through as camelCase keys (THEME-07)
- 14 passing tests

## Verification Results

- All 23 theme tests pass (9 parser + 14 mapper)
- `themeCss` field present in ConvertOptions
- All expected exports verified: ThemeDeclaration, ParseThemeResult, ThemeMapResult, parseThemeCss, mapToThemeConfig, NAMESPACE_MAP

## Deviations from Plan

None -- plan executed exactly as written.

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|------------|
| T-06-01 | All declarations validated to start with `--`; non-declaration content warned and skipped |
| T-06-02 | CSS comment stripping uses lazy quantifier `[\s\S]*?` to avoid ReDoS |
| T-06-04 | Unknown property names sanitized through camelCase conversion, never used as code paths |

## Self-Check: PASSED
