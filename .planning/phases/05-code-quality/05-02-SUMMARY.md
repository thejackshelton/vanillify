---
phase: 05-code-quality
plan: 02
subsystem: regex-readability
tags: [magic-regexp, regex, code-quality, rewriter, generator, variant-parser]
dependency_graph:
  requires: [magic-regexp-foundation]
  provides: [SHORTHAND_RE-magic-regexp, NAME_RE-constant, LAYER_RE-constant, REGEX_META_RE-constant, CSS_SELECTOR_RE-constant]
  affects: [src/variants/parser.ts, src/pipeline/generator.ts, src/pipeline/rewriter.ts]
tech_stack:
  added: []
  patterns: [named-capture-groups, charIn-for-character-classes, INTENTIONALLY-RAW-documentation]
key_files:
  created: []
  modified: [src/variants/parser.ts, src/pipeline/generator.ts, src/pipeline/rewriter.ts]
decisions:
  - charIn() handles complex metacharacter sets including escapeRegex; no raw regex needed for static patterns
  - Dynamic regex in matchesAnyPattern documented as INTENTIONALLY RAW (runtime construction from user class names)
metrics:
  duration: 195s
  completed: 2026-04-05
  tasks: 3
  files: 3
---

# Phase 5 Plan 2: Convert Complex Patterns and Document Dynamic Regex Summary

Converted all remaining static regex patterns (variant parser SHORTHAND_RE with named groups, generator LAYER_RE, rewriter escapeRegex and CSS selector escape) to magic-regexp, and documented dynamic patterns in rewriter.ts as intentionally raw.

## Task Completion

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Convert variant parser patterns | 7c29ea9 | SHORTHAND_RE with named capture groups, NAME_RE validator constant |
| 2 | Convert generator layer pattern | 8323742 | LAYER_RE module-level constant with lastIndex reset |
| 3 | Convert rewriter static patterns, document dynamic | 7c226b9 | REGEX_META_RE and CSS_SELECTOR_RE via charIn(), INTENTIONALLY RAW comments |

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **charIn() works for metacharacter escaping:** The escapeRegex pattern `/[.*+?^${}()|[\]\\]/g` was successfully converted to `charIn(".*+?^${}()|[]\\")`. Testing confirmed all 14 metacharacters match correctly and non-meta characters are excluded.
2. **Named groups for SHORTHAND_RE:** Converted positional captures (`match[1]`, `match[2]`) to named groups (`match.groups.name`, `match.groups.selector`) with fallback to positional for safety.
3. **Dynamic regex stays raw:** The `new RegExp(pattern + "...")` in `matchesAnyPattern` and the `pattern.replace(/\\\\/g, "\\")` fallback are runtime-constructed from user class names and cannot use magic-regexp. Documented with INTENTIONALLY RAW comments.

## Verification Results

- `pnpm test`: 75/75 tests pass (8 test files, zero behavior change)
- `pnpm build`: exits 0 (ESM format, 25.36 KB total)
- Variant parser: 8/8 tests pass (named groups work identically)
- Generator: 12/12 tests pass (layer stripping unchanged)
- Rewriter: 8/8 tests pass (escaping functions produce identical output)

## Static Regex Audit

All static regex patterns in production source files now use magic-regexp:

| File | Pattern | Constant | Plan |
|------|---------|----------|------|
| src/pipeline/extractor.ts | `\s+` | WS_RE | 05-01 |
| src/variants/resolver.ts | `&` | AMPERSAND_RE | 05-01 |
| src/cli.ts | `\.(ts\|js)(x?)$` | EXT_RE | 05-01 |
| src/variants/parser.ts | `@custom-variant...` | SHORTHAND_RE | 05-02 |
| src/variants/parser.ts | `^[\w-]+$` | NAME_RE | 05-02 |
| src/pipeline/generator.ts | `@layer [\w-]+ {` | LAYER_RE | 05-02 |
| src/pipeline/rewriter.ts | `[.*+?^${}()\|[\]\\]` | REGEX_META_RE | 05-02 |
| src/pipeline/rewriter.ts | `[[\]#()/:,.%@!]` | CSS_SELECTOR_RE | 05-02 |

## Dynamic Regex (Intentionally Raw)

| File | Line | Pattern | Reason |
|------|------|---------|--------|
| src/pipeline/rewriter.ts | matchesAnyPattern | `new RegExp(pattern + "...")` | Runtime construction from user class names |
| src/pipeline/rewriter.ts | matchesAnyPattern fallback | `/\\\\/g` | Fallback string replacement for escaped backslashes |

## Self-Check: PASSED

- [x] src/variants/parser.ts uses SHORTHAND_RE and NAME_RE magic-regexp constants
- [x] src/pipeline/generator.ts uses LAYER_RE magic-regexp constant
- [x] src/pipeline/rewriter.ts uses REGEX_META_RE and CSS_SELECTOR_RE magic-regexp constants
- [x] Dynamic patterns in rewriter.ts have INTENTIONALLY RAW comments
- [x] All 75 tests pass
- [x] Build succeeds
- [x] Commit 7c29ea9 exists
- [x] Commit 8323742 exists
- [x] Commit 7c226b9 exists
