---
phase: 06-theme-support
plan: 03
subsystem: cli
tags: [cli, theme, flag]
dependency_graph:
  requires: ["06-02"]
  provides: ["cli-theme-flag"]
  affects: ["src/cli.ts"]
tech_stack:
  added: []
  patterns: ["theme CSS prepended to output"]
key_files:
  modified: ["src/cli.ts"]
decisions:
  - "Theme CSS prepended to utility CSS in output file (themeCss + newlines + css)"
metrics:
  duration_seconds: 48
  completed: "2026-04-05"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 6 Plan 3: CLI --theme Flag Summary

**One-liner:** Added --theme / -t CLI flag that reads a theme CSS file and passes it through convert() for theme-aware CSS generation.

## What Was Done

### Task 1: Add --theme CLI flag (auto)
- Added `theme` arg with alias `t` to citty command definition
- Added theme CSS file reading before the file processing loop
- Updated options construction to include `themeCss` alongside `customVariants`
- Updated output writing to prepend `result.themeCss` to the `.vanilla.css` file
- Added `ConvertOptions` type import
- **Commit:** a695d5b

### Task 2: Verify end-to-end theme workflow (checkpoint:human-verify)
- Auto-approved per execution directive
- All 114 tests pass across 10 test files

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- All acceptance criteria greps pass (theme arg, alias, themeCss, result.themeCss)
- All 114 tests pass (10 test files)
- CLI without --theme works identically to before (options is undefined when no flags provided)

## Self-Check: PASSED
