---
phase: 05-code-quality
plan: 01
subsystem: regex-readability
tags: [magic-regexp, regex, code-quality, developer-experience]
dependency_graph:
  requires: []
  provides: [magic-regexp-foundation, WS_RE-constant, AMPERSAND_RE-constant, EXT_RE-constant]
  affects: [src/pipeline/extractor.ts, src/variants/resolver.ts, src/cli.ts, vite.config.ts]
tech_stack:
  added: [magic-regexp@0.11.0]
  patterns: [module-level-regex-constants, magic-regexp-builder-api]
key_files:
  created: []
  modified: [package.json, vite.config.ts, src/pipeline/extractor.ts, src/variants/resolver.ts, src/cli.ts]
decisions:
  - Transform plugin incompatible with Rolldown TS pipeline; accepted runtime fallback (~2KB)
metrics:
  duration: 203s
  completed: 2026-04-05
  tasks: 2
  files: 5
---

# Phase 5 Plan 1: magic-regexp Foundation and Low-Complexity Pattern Conversion Summary

Installed magic-regexp and converted 5 static regex patterns (S3-S6, S10) to type-safe builder API across 3 source files, accepting runtime fallback after discovering transform plugin incompatibility with Rolldown's TypeScript pipeline.

## Task Completion

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Install magic-regexp and configure transform plugin | f579f55 | Added magic-regexp@0.11.0 as runtime dep, initially added transform plugin |
| 2 | Convert low-complexity static patterns (S3-S6, S10) | 9581445 | Replaced 5 regex patterns across 3 files, removed transform plugin |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] MagicRegExpTransformPlugin incompatible with Rolldown TS pipeline**
- **Found during:** Task 2 (build verification)
- **Issue:** The transform plugin calls `this.parse(code)` which uses Rolldown's JS parser before TypeScript is stripped. This causes parse errors on `import type` and type assertion syntax (`as string[]`). The plugin has `enforce: "post"` but Rolldown does not respect this in the same way as Vite's transform pipeline.
- **Fix:** Removed MagicRegExpTransformPlugin from pack.plugins. magic-regexp works at runtime as a fallback -- `createRegExp()` returns native RegExp objects. This adds ~2KB to the bundle but the behavior is identical. This was anticipated in the research as Open Question 1: "If transform fails, fall back to minimal runtime (~2KB)."
- **Files modified:** vite.config.ts
- **Commit:** 9581445
- **Impact on acceptance criteria:** The plan's acceptance criteria stated "dist/ does NOT contain createRegExp". With the runtime fallback, dist/ will contain magic-regexp runtime imports. This is the documented fallback behavior and does not affect correctness.

## Decisions Made

1. **Runtime fallback over transform plugin:** The MagicRegExpTransformPlugin.rollup() cannot parse TypeScript files in Rolldown's build pipeline. Accepted the ~2KB runtime fallback per research Open Question 1 rather than attempting a complex workaround (custom plugin wrapper, pre-strip TS types, etc.).

## Verification Results

- `pnpm build`: exits 0 (both CJS and ESM formats)
- `pnpm test`: 75/75 tests pass (8 test files, zero behavior change)
- No raw `/\s+/` in extractor.ts (3 occurrences replaced with WS_RE)
- No raw `/&/g` in resolver.ts (replaced with AMPERSAND_RE)
- No raw `/\.(tsx?|jsx?)$/` in cli.ts (2 occurrences replaced with EXT_RE)

## Self-Check: PASSED

- [x] package.json contains magic-regexp dependency
- [x] vite.config.ts updated with comment explaining transform incompatibility
- [x] src/pipeline/extractor.ts uses WS_RE constant (3 replacements)
- [x] src/variants/resolver.ts uses AMPERSAND_RE constant (1 replacement)
- [x] src/cli.ts uses EXT_RE constant (2 replacements)
- [x] All 75 tests pass
- [x] Build succeeds for both CJS and ESM
- [x] Commit f579f55 exists
- [x] Commit 9581445 exists
