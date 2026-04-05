---
phase: 01-core-pipeline
plan: 04
subsystem: convert-pipeline-integration
tags: [rewriter, convert-api, span-rewriting, css-assembly, integration-tests]

requires:
  - phase: 01-core-pipeline/01-01
    provides: Parser module (parse) and core types
  - phase: 01-core-pipeline/01-02
    provides: Extractor module (extract) with AST-based class extraction
  - phase: 01-core-pipeline/01-03
    provides: Generator module (generateCSS) and Namer module (assignNames, selectorFor)
provides:
  - Span-based source rewriter transforming className values to indexed names
  - Per-node CSS assembly with .nodeN selectors
  - Public convert() API wiring full pipeline (parse -> extract -> name -> rewrite)
  - Integration tests covering real-world JSX/TSX inputs
affects: [02-custom-variants, 03-cli-packaging]

tech-stack:
  added: []
  patterns: [pipeline-composition, reverse-span-replacement, per-node-css-isolation]

key-files:
  created:
    - src/pipeline/rewriter.ts
    - src/pipeline/rewriter.test.ts
    - test/integration/convert.test.ts
  modified:
    - src/index.ts

key-decisions:
  - "Per-node CSS generation isolates each element's CSS, enabling clean .nodeN selector replacement"
  - "Default layer extraction from UnoCSS output skips theme/base/properties layers, keeping output clean"
  - "Unescaped colon detection distinguishes real CSS pseudo-classes from UnoCSS escaped variant prefixes"

patterns-established:
  - "Pipeline composition: convert() orchestrates parse -> extract -> name -> rewrite as pure async function"
  - "Reverse span replacement: replacements sorted by descending start offset to avoid index drift"
  - "Integration tests use full pipeline (no hardcoded spans) for correctness"

requirements-completed: [CORE-01, CORE-06]

duration: 4min
completed: 2026-04-05
---

# Phase 01 Plan 04: Rewriter and Convert Pipeline Summary

**Span-based rewriter with per-node CSS assembly wired into convert() public API -- full Tailwind-to-vanilla-CSS pipeline working end-to-end**

## Performance

- **Duration:** 4 min (247s)
- **Started:** 2026-04-05T04:03:22Z
- **Completed:** 2026-04-05T04:07:29Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Rewriter module that replaces className values with indexed names using span-based source rewriting
- Per-node CSS assembly: extracts UnoCSS default layer, rewrites utility selectors to .nodeN, merges plain declarations, preserves pseudo-class and @media wrappers
- Public convert(source, filename) API orchestrating the full 5-stage pipeline
- 8 integration tests validating real-world scenarios: basic utilities, pseudo-class variants, responsive variants, arbitrary values, dynamic class warnings, class attribute, checkbox fixture, empty source

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewriter module** - `22d711c` (test: failing tests), `8f1dad7` (feat: implementation)
2. **Task 2: convert() API + integration tests** - `841e8d9` (feat: wired API with tests)

_TDD workflow: Task 1 has separate test and implementation commits_

## Files Created/Modified
- `src/pipeline/rewriter.ts` - Span-based source rewriting, per-node CSS assembly with .nodeN selectors, pseudo-class and @media handling
- `src/pipeline/rewriter.test.ts` - 7 unit tests for rewriter module
- `src/index.ts` - Public convert() API wiring parse -> extract -> name -> rewrite pipeline
- `test/integration/convert.test.ts` - 8 integration tests for end-to-end conversion

## Decisions Made
- **Per-node CSS generation**: Each node gets its own generateCSS call rather than a single call for all tokens. This isolates CSS per element, making .nodeN selector replacement clean and avoiding cross-node declaration mixing.
- **Default layer extraction**: UnoCSS output includes theme, base, properties, and default layers. Only the default layer contains utility rules. Extracting just that layer keeps output clean and avoids emitting reset CSS.
- **Unescaped colon detection for pseudo-classes**: UnoCSS escapes colons in variant class names (e.g., `hover\:bg-blue-700`). Real pseudo-classes use bare colons. Character-by-character scanning detects which colons are real pseudo-class prefixes vs escaped class name characters.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all modules are fully implemented with no placeholder data.

## Next Phase Readiness
- Phase 1 (Core Pipeline) is complete: all 4 plans executed successfully
- The convert() API is ready for Phase 2 (Custom Variants) which will extend ConvertOptions
- The convert() API is ready for Phase 3 (CLI + Packaging) which will wrap it in a CLI

## Self-Check: PASSED
