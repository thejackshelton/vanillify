# Requirements: Vanillify

**Defined:** 2026-04-04
**Core Value:** Accurate, reliable conversion of Tailwind classes to vanilla CSS via UnoCSS's createGenerator

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Core Pipeline

- [x] **CORE-01**: Library exposes `convert()` function that accepts JSX/TSX source string and returns CSS string + transformed component string in-memory
- [x] **CORE-02**: oxc-parser extracts class/className attribute values from JSX/TSX AST (not regex)
- [x] **CORE-03**: UnoCSS `createGenerator` with `preset-wind4` generates CSS from extracted Tailwind classes
- [x] **CORE-04**: Generated CSS uses indexed class names (`.node0`, `.node1`, etc.) assigned per JSX element
- [x] **CORE-05**: Output CSS is formatted and readable (not minified)
- [x] **CORE-06**: Transformed component replaces Tailwind class strings with generated class names
- [x] **CORE-07**: Dynamic class expressions (ternaries, template literals, clsx) are detected and warned, not silently skipped
- [x] **CORE-08**: Library handles arbitrary Tailwind values (e.g. `text-[#ff0000]`, `w-[calc(100%-1rem)]`)

### Variants

- [x] **VARI-01**: Standard pseudo-class variants resolve to CSS pseudo-selectors (hover: → :hover, focus: → :focus, etc.)
- [x] **VARI-02**: Responsive breakpoint variants resolve to @media rules (sm:, md:, lg:, xl:, 2xl:)
- [x] **VARI-03**: Stacked/compound variants resolve correctly (dark:hover:text-white → nested conditions)

### Custom Variants

- [x] **CVAR-01**: User can opt-in to custom variant resolution by providing `@custom-variant` CSS definitions
- [x] **CVAR-02**: Custom variants (e.g. ui-checked, ui-disabled, ui-mixed) resolve to simplified descendant selectors in vanilla CSS output
- [x] **CVAR-03**: Custom variant resolution does not affect core pipeline when not opted in

### CLI

- [ ] **CLI-01**: CLI accepts file paths/globs as input and writes converted files to disk
- [ ] **CLI-02**: CLI wraps the programmatic API (no separate conversion logic)

### Build & Package

- [ ] **PKG-01**: Library built with tsdown, dual ESM+CJS output
- [ ] **PKG-02**: Library exports typed API via package.json exports field
- [ ] **PKG-03**: Tests run via vitest with fixture-based snapshots (Qwik checkbox example as primary fixture)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhancements

- **ENH-01**: Semantic class naming via pluggable nameGenerator callback
- **ENH-02**: Local AI model integration for semantic class naming
- **ENH-03**: HTML file support (non-JSX inputs)
- **ENH-04**: Theme block conversion (@theme → CSS custom properties)
- **ENH-05**: Watch mode for development workflows
- **ENH-06**: CSS Modules output format option

## Out of Scope

| Feature | Reason |
|---------|--------|
| Runtime/JIT conversion | Fundamentally different product — vanillify is static/build-time |
| SCSS/Sass output | Flat CSS works everywhere; preprocessor adds no value for this use case |
| Source maps | No established spec for CSS-from-className transforms |
| Semantic naming in v1 | Requires intent inference; indexed names are the stable intermediate for AI workflows |
| Theme support in v1 | Reference implementation's theme handling was problematic; get core right first |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | Phase 1 | Complete |
| CORE-02 | Phase 1 | Complete |
| CORE-03 | Phase 1 | Complete |
| CORE-04 | Phase 1 | Complete |
| CORE-05 | Phase 1 | Complete |
| CORE-06 | Phase 1 | Complete |
| CORE-07 | Phase 1 | Complete |
| CORE-08 | Phase 1 | Complete |
| VARI-01 | Phase 1 | Complete |
| VARI-02 | Phase 1 | Complete |
| VARI-03 | Phase 1 | Complete |
| CVAR-01 | Phase 2 | Complete |
| CVAR-02 | Phase 2 | Complete |
| CVAR-03 | Phase 2 | Complete |
| CLI-01 | Phase 3 | Pending |
| CLI-02 | Phase 3 | Pending |
| PKG-01 | Phase 3 | Pending |
| PKG-02 | Phase 3 | Pending |
| PKG-03 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-04*
*Last updated: 2026-04-04 after roadmap creation*
