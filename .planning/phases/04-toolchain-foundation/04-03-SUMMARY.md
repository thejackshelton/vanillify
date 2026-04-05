---
phase: 04-toolchain-foundation
plan: 03
subsystem: infra
tags: [oxlint, oxfmt, linting, formatting, code-quality, vite-plus]

requires:
  - phase: 04-toolchain-foundation/02
    provides: vite-plus unified config with pack and test blocks
provides:
  - lint and fmt blocks in vite.config.ts
  - vp lint, vp fmt, and vp check commands
  - Initial oxfmt formatting pass applied to entire codebase
affects: []

tech-stack:
  added: [oxlint, oxfmt]
  patterns: [unified vite-plus defineConfig for pack+test+lint+fmt]

key-files:
  created: []
  modified: [vite.config.ts, package.json, src/**/*.ts, test/**/*.ts, CLAUDE.md, README.md]

decisions:
  - Added ignorePatterns to fmt block to exclude fixtures directory (oxfmt was reformatting CSS fixture files, breaking snapshot tests)
  - Used empty fmt config aside from ignorePatterns (oxfmt defaults are acceptable; singleQuote is not a valid oxfmt option)
  - oxfmt switched codebase from single quotes to double quotes (oxfmt default)

metrics:
  duration: 121s
  completed: 2026-04-05
  tasks_completed: 1
  tasks_total: 1
  files_modified: 23
---

# Phase 04 Plan 03: Lint and Fmt Configuration Summary

Configured oxlint (linting) and oxfmt (formatting) through vite-plus unified config, added lint/fmt/check scripts, and applied initial formatting pass across the codebase.

## What Was Done

### Task 1: Add lint and fmt blocks to vite.config.ts and update scripts

Added `lint` and `fmt` blocks to the existing vite.config.ts. The lint block configures ignore patterns for dist, fixtures, and node_modules. The fmt block also ignores these directories to prevent oxfmt from reformatting CSS fixture files used in snapshot tests.

Added three new scripts to package.json:
- `lint` -> `vp lint`
- `fmt` -> `vp fmt`
- `check` -> `vp check`

Ran initial `vp fmt` pass which reformatted all source files (switched to double quotes, adjusted indentation in some files). Verified all 75 tests pass and build produces dist/ output after formatting.

**Commit:** e97daae

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added ignorePatterns to fmt block for fixtures directory**
- **Found during:** Task 1, Step 4-5
- **Issue:** oxfmt reformatted `fixtures/checkbox.css` adding spaces after CSS property colons, which broke the snapshot test that compares converter output (no spaces) against the fixture file
- **Fix:** Added `ignorePatterns: ["dist/**", "fixtures/**", "node_modules/**"]` to the fmt block, matching the lint block's ignore patterns. Restored fixture files from git.
- **Files modified:** vite.config.ts
- **Commit:** e97daae

**2. [Rule 3 - Blocking] Removed singleQuote option from fmt config**
- **Found during:** Task 1, Step 1
- **Issue:** The plan suggested `singleQuote: true` or `quote_style: 'single'` for the fmt block, but oxfmt does not support quote style configuration. Used empty config instead (plan anticipated this possibility).
- **Fix:** Used empty fmt block with only ignorePatterns
- **Files modified:** vite.config.ts
- **Commit:** e97daae

## Verification Results

| Check | Result |
|-------|--------|
| vite.config.ts has lint block | PASS |
| vite.config.ts has fmt block | PASS |
| package.json has lint script | PASS |
| package.json has fmt script | PASS |
| package.json has check script | PASS |
| `vp lint` runs without config errors | PASS (0 warnings, 0 errors) |
| `vp fmt` runs successfully | PASS (24 files) |
| `vp check` runs successfully | PASS (all files formatted, no lint errors) |
| All tests pass after formatting | PASS (75/75) |
| Build produces dist/ after formatting | PASS |

## Self-Check: PASSED
