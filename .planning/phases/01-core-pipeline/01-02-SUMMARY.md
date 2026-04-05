---
phase: 01-core-pipeline
plan: 02
subsystem: ast-class-extractor
tags: [extractor, oxc-walker, ast, jsx, dynamic-class-detection]
dependency_graph:
  requires: [01-01]
  provides: [extractor-module]
  affects: [01-03, 01-04]
tech_stack:
  added: [oxc-walker]
  patterns: [ast-visitor-pattern, tdd-red-green]
key_files:
  created:
    - src/pipeline/extractor.ts
    - src/pipeline/extractor.test.ts
  modified: []
decisions:
  - "Used oxc-walker walk() with enter callback for AST traversal -- native ESTree visitor over manual recursion"
  - "oxc-parser emits ESTree Literal nodes (not StringLiteral) -- adapted extractStaticFragments accordingly"
metrics:
  duration: 114s
  completed: "2026-04-05T03:57:00Z"
  tasks_completed: 1
  tasks_total: 1
  test_count: 8
  test_pass: 8
---

# Phase 01 Plan 02: AST Class Extractor Summary

AST-based class/className extraction from JSX/TSX using oxc-walker, with static fragment extraction from dynamic expressions and dynamic-class warnings.

## What Was Built

The extractor module (`src/pipeline/extractor.ts`) walks an oxc-parser AST using oxc-walker and produces `NodeEntry[]` with class tokens, byte offset spans, and dynamic detection. It is the second stage of the vanillify pipeline (after parsing).

### Key Capabilities

- **Static extraction**: Splits `className="flex gap-2"` into `['flex', 'gap-2']` tokens
- **Dynamic detection**: Marks `JSXExpressionContainer` values as `isDynamic: true`
- **Fragment extraction**: Pulls static strings from ternary branches, logical expressions, and template literal quasis
- **Warning emission**: Generates `dynamic-class` warnings with line:column location
- **DOM-order indexing**: `nodeIndex` increments in AST traversal order (top-to-bottom, left-to-right)
- **Dual attribute support**: Handles both `class` and `className` attributes

### Architecture

```
parse() -> AST Program
              |
         extract(program, source)
              |
         walk() visits JSXAttribute nodes
              |
         ┌────────────────┬──────────────────┐
         │ Literal value   │ ExpressionContainer │
         │ (static)        │ (dynamic)            │
         │ split tokens    │ extractStaticFragments│
         └────────────────┴──────────────────┘
              |
         ExtractResult { entries, warnings }
```

## Task Completion

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for extractor | dfc7451 | src/pipeline/extractor.ts, src/pipeline/extractor.test.ts |
| 1 (GREEN) | Implement extractor with oxc-walker | fc04cee | src/pipeline/extractor.ts |

## Test Results

All 8 test cases passing:
1. Static className from single element
2. Class attribute (not just className)
3. nodeIndex in DOM order across multiple elements
4. Ternary expression detected as dynamic with both branches extracted
5. Template literal detected as dynamic with static quasis extracted
6. Function call (clsx/cn) detected as dynamic
7. Correct byte offset spans
8. Elements without class attribute skipped

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESTree node type is Literal not StringLiteral**
- **Found during:** Task 1 GREEN phase
- **Issue:** Plan referenced `StringLiteral` node type, but oxc-parser emits ESTree-spec `Literal` nodes with string values
- **Fix:** Changed type checks from `StringLiteral` to `Literal` with `typeof value === 'string'` guard
- **Files modified:** src/pipeline/extractor.ts
- **Commit:** fc04cee

## Decisions Made

1. **oxc-walker walk() over manual recursion** -- The oxc-walker package provides a proper visitor pattern with enter/leave callbacks. Since it's already a project dependency (installed in 01-01), using it is cleaner than manual AST recursion.
2. **Literal type check with string guard** -- oxc-parser follows ESTree spec where string literals are `{ type: "Literal", value: "..." }` rather than a separate `StringLiteral` node type. Added `typeof value === 'string'` to distinguish from numeric/boolean literals.

## Self-Check: PASSED

All files verified present. All commit hashes verified in git log.
