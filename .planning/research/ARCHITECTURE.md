# Architecture Research

**Domain:** CSS converter/transformer library (Tailwind to vanilla CSS)
**Researched:** 2026-04-04
**Confidence:** HIGH (pipeline structure well-established; specific UnoCSS return types MEDIUM from DeepWiki/indirect sources)

## Standard Architecture

### System Overview

The canonical architecture for a code-to-code transformer follows a three-stage compiler pipeline (front end, middle end, back end) adapted for the source transformation use case. For vanillify, the pipeline maps cleanly:

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Entry Points                               │
│                                                                     │
│  ┌───────────────────────┐       ┌───────────────────────────────┐  │
│  │     Programmatic API  │       │        CLI (bin/cli.ts)       │  │
│  │  import { convert }   │       │  npx vanillify <files>        │  │
│  │  from 'vanillify'     │       │                               │  │
│  └──────────┬────────────┘       └──────────────┬────────────────┘  │
│             │                                   │                   │
│             └──────────────┬────────────────────┘                   │
│                            │ ConvertOptions                         │
└────────────────────────────┼────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         Core Pipeline                               │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐            │
│  │   1. PARSER  │ → │ 2. EXTRACTOR │ → │ 3. GENERATOR │            │
│  │  (oxc-parser)│   │  (AST walk)  │   │  (UnoCSS     │            │
│  │              │   │              │   │  createGen.) │            │
│  │ source text  │   │ [className,  │   │              │            │
│  │     ↓        │   │  node index] │   │ CSS string   │            │
│  │ AST + spans  │   │  pairs       │   │ per class    │            │
│  └──────────────┘   └──────────────┘   └──────────────┘            │
│                                               │                     │
│  ┌────────────────────────────────────────────┘                     │
│  ↓                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                4. REWRITER                                   │   │
│  │  (source text + span map → updated source + CSS file)        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    Supporting Services                              │
│                                                                     │
│  ┌─────────────────────┐   ┌───────────────────────────────────┐   │
│  │  Variant Resolver   │   │      Index Namer                  │   │
│  │  (custom @variant   │   │  (.node0, .node1, ...)            │   │
│  │   mapping table)    │   │                                   │   │
│  └─────────────────────┘   └───────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| Programmatic API (`src/index.ts`) | Public surface: exports `convert()` and types | Thin wrapper around core pipeline |
| CLI (`src/cli.ts`) | File I/O, argument parsing, disk writes | Calls programmatic API; handles glob expansion, output paths |
| Parser (`src/parser.ts`) | Parse source text into AST using oxc-parser `parseSync` | Wraps oxc-parser; returns program AST + source spans |
| Extractor (`src/extractor.ts`) | Walk JSX AST nodes; collect (className string, node index) pairs with source spans | Visitor pattern over JSXAttribute nodes; builds extraction map |
| Variant Resolver (`src/variants.ts`) | Map custom Tailwind `@custom-variant` names to vanilla CSS selectors | User-provided mapping table; applied before CSS generation |
| CSS Generator (`src/generator.ts`) | Call UnoCSS `createGenerator` with presetWind4; invoke `generate()` per class set | Singleton generator instance; maps Tailwind tokens to CSS strings |
| Index Namer (`src/namer.ts`) | Assign indexed class names `.node0`, `.node1` etc. per-file | Counter per file; deterministic based on DOM order extracted |
| Rewriter (`src/rewriter.ts`) | Using source spans from extractor, replace className values in source text; assemble final CSS | Span-based text replacement (not AST reprinting); produces updated source + CSS |

## Recommended Project Structure

```
src/
├── index.ts              # Public API: export convert(), ConvertOptions, ConvertResult
├── cli.ts                # CLI entry point (bin field in package.json)
├── pipeline/
│   ├── parser.ts         # oxc-parser wrapper: source → AST + spans
│   ├── extractor.ts      # AST → [{classNames, span, nodeIndex}]
│   ├── generator.ts      # UnoCSS createGenerator singleton + generate()
│   ├── namer.ts          # Indexed class name assignment
│   └── rewriter.ts       # Span-based source rewrite + CSS assembly
├── variants/
│   ├── resolver.ts       # Custom variant mapping: @custom-variant → CSS selector
│   └── types.ts          # VariantMap, CustomVariant types
└── types.ts              # ConvertOptions, ConvertResult, NodeEntry public types

test/
├── fixtures/             # .tsx input files for snapshot testing
│   ├── basic.tsx
│   ├── variants.tsx
│   └── custom-variants.tsx
├── pipeline/             # Unit tests per pipeline stage
└── integration/          # End-to-end convert() tests

bin/
└── vanillify.js          # Shebang wrapper: #!/usr/bin/env node — imports src/cli.ts
```

### Structure Rationale

- **`pipeline/` folder:** Each stage is a separate module with a single responsibility. This makes unit testing each stage in isolation natural and keeps the stages independently replaceable.
- **`variants/` folder:** Custom variant resolution is a distinct concern from the main pipeline — it is opt-in and user-configurable. Isolating it prevents variant logic from polluting the core generator.
- **`index.ts` as the only public API surface:** All exports route through one file, which means the package's public interface is controlled in one place and the internal pipeline structure can change freely.
- **`bin/vanillify.js` as the CLI shebang entry:** Separation of the shebang wrapper from the CLI logic (in `src/cli.ts`) allows `src/cli.ts` to be imported in tests without executing the process.

## Architectural Patterns

### Pattern 1: Span-Based Rewriting (Not AST Reprinting)

**What:** After extracting class names with their source positions (spans), the rewriter patches the original source text at those exact character offsets rather than reprinting the entire AST.

**When to use:** Always for this use case — the goal is minimal diff. Reprinting from AST destroys formatting, comments, and whitespace. Span patching preserves everything except the changed className values.

**Trade-offs:** Requires accurate span tracking from the extractor. Mutations must be applied in reverse order (last span first) to avoid offset drift. Both are manageable constraints.

**Example:**
```typescript
// Apply replacements in reverse source order to avoid offset drift
const sorted = replacements.sort((a, b) => b.start - a.start)
let result = source
for (const { start, end, newValue } of sorted) {
  result = result.slice(0, start) + newValue + result.slice(end)
}
```

### Pattern 2: Singleton Generator with Lazy Init

**What:** UnoCSS's `createGenerator` is async as of v0.65.0. Initialize it once at module load (or on first call) and reuse it across all files in a batch.

**When to use:** Any time processing multiple files — creating a new generator per file is expensive and unnecessary.

**Trade-offs:** State lives in module scope. Not an issue for a build-time CLI tool, but callers using the programmatic API in long-running processes should be aware.

**Example:**
```typescript
// generator.ts
let _generator: UnoGenerator | null = null

export async function getGenerator(config?: UserConfig): Promise<UnoGenerator> {
  if (!_generator) {
    _generator = await createGenerator({
      presets: [presetWind4()],
      ...config,
    })
  }
  return _generator
}
```

### Pattern 3: Dual Entry Point (Library + CLI)

**What:** The package exposes two separate entry points: a programmatic API (`main`/`exports`) for `import { convert }` usage, and a CLI binary (`bin`) for `npx vanillify`. Both are built by tsdown from the same source.

**When to use:** Standard pattern for developer tools that need to be both embeddable in build pipelines and usable standalone.

**Trade-offs:** Requires careful separation — CLI code (process.exit, console.log, fs writes) must not leak into the library entry point.

**Example package.json structure:**
```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "bin": {
    "vanillify": "./bin/vanillify.js"
  }
}
```

### Pattern 4: Per-File Processing with Shared Generator

**What:** Each source file is an independent unit of work — parse, extract, generate, rewrite — but all files share the same initialized UnoCSS generator instance.

**When to use:** Required for correct indexed naming (`.node0` resets per file) and for supporting parallel processing in the future.

**Trade-offs:** Generator must be thread-safe (UnoCSS generator is stateless for generation; only caches matched rules which is safe to share).

## Data Flow

### Single File Conversion

```
convert(source: string, filename: string, options: ConvertOptions)
    │
    ├─ parser.ts: parseSync(filename, source)
    │      └─ returns: { program: Program, errors[] }
    │
    ├─ extractor.ts: extractClasses(program, source)
    │      └─ returns: NodeEntry[] = [{ nodeIndex, classNames: string[], span: {start,end} }]
    │
    ├─ variants.ts: resolveVariants(classNames, options.customVariants?)
    │      └─ returns: classNames with custom variant prefixes mapped to vanilla selectors
    │
    ├─ namer.ts: assignNames(entries)
    │      └─ returns: Map<nodeIndex, generatedClassName>  (.node0, .node1, ...)
    │
    ├─ generator.ts: generateCSS(classNames, generatedClassName)
    │      └─ calls: uno.generate(classTokens)
    │      └─ returns: { css: string } per node entry
    │
    └─ rewriter.ts: rewrite(source, entries, nameMap, cssBlocks)
           └─ returns: ConvertResult = { source: string, css: string }
```

### CLI Batch Flow

```
CLI args (glob pattern, output flags)
    │
    ├─ Expand globs → file list
    ├─ For each file:
    │      └─ read file → convert() → write updated source, write .css
    └─ Report: N files converted, M errors
```

### Key Data Structures

```typescript
// Input to pipeline
interface ConvertOptions {
  customVariants?: Record<string, string>  // e.g. { 'ui-checked': '[ui-checked]' }
}

// Intermediate: one entry per JSX element with className
interface NodeEntry {
  nodeIndex: number           // 0-based DOM order
  classNames: string[]        // extracted Tailwind tokens
  span: { start: number; end: number }  // byte offsets in source
}

// Final output
interface ConvertResult {
  source: string   // transformed source with .node0, .node1 class names
  css: string      // generated vanilla CSS, all nodes combined
}
```

## Scaling Considerations

This is a build-time static analysis tool, not a server. Scaling means "handles large codebases" rather than "handles traffic."

| Scale | Concern | Approach |
|-------|---------|---------|
| 1–50 files | None | Sequential processing is fine |
| 50–500 files | Generator init overhead | Singleton generator pattern (already recommended) |
| 500+ files | Wall-clock time | Parallel file processing via worker_threads or Promise.all; each file is independent |
| Very large files | Memory | oxc-parser uses arena allocation; not expected to be an issue in practice |

## Anti-Patterns

### Anti-Pattern 1: Regex-Based Class Extraction

**What people do:** Use a regular expression like `/className="([^"]+)"/g` to extract class names from source files.

**Why it's wrong:** Fails on template literals, dynamic classNames, conditional expressions, multi-line attributes, and any non-trivial JSX. The reference implementation (`tailwind-v4-to-css-converter`) demonstrated this limitation. AST-based extraction is the whole point of vanillify's improvement.

**Do this instead:** Use oxc-parser's `parseSync` with a JSX-aware visitor to walk `JSXAttribute` nodes where the attribute name is `className`.

### Anti-Pattern 2: Reprinting AST for Source Transformation

**What people do:** Transform the AST then call a printer (e.g., esrap, recast) to regenerate source from the modified AST.

**Why it's wrong:** Destroys formatting, comments, and whitespace. For a migration tool, the diff should be surgical — only the className values change.

**Do this instead:** Use span-based patching. Record `{ start, end }` positions from the AST, apply replacements in reverse order to the original source string.

### Anti-Pattern 3: Creating a New UnoCSS Generator Per File

**What people do:** Call `createGenerator()` inside the per-file processing loop.

**Why it's wrong:** `createGenerator` is async and performs preset initialization. Calling it for every file wastes time and memory on repeated setup. In a large project this is measurable.

**Do this instead:** Initialize the generator once before the processing loop and pass it (or import the singleton) into each file's processing context.

### Anti-Pattern 4: Mixing CLI I/O into the Core Pipeline

**What people do:** Call `console.log`, `process.exit`, or `fs.writeFileSync` inside `convert()` or pipeline stage modules.

**Why it's wrong:** Breaks the programmatic API. Callers who import `convert()` don't expect side effects, stdout output, or process termination from the library.

**Do this instead:** The library returns results; the CLI wrapper decides what to print and write. The only public API boundary is `ConvertResult`.

### Anti-Pattern 5: Bundling Custom Variant Logic into the CSS Generator

**What people do:** Teach the generator about custom variants by baking them into the UnoCSS configuration.

**Why it's wrong:** If UnoCSS's `createGenerator` doesn't natively understand Tailwind v4's `@custom-variant` directive (which is an open research question), embedding variant resolution in the generator creates a tight coupling that's hard to test and swap.

**Do this instead:** Pre-process class tokens through the Variant Resolver before handing them to the CSS Generator. The resolver is a pure mapping function, independently testable, and can be extended without touching the UnoCSS integration.

## Integration Points

### External Libraries

| Library | Integration Pattern | Notes |
|---------|---------------------|-------|
| `oxc-parser` | Import `parseSync` and `Visitor`; call once per file | Synchronous; no async overhead. File extension in filename arg determines JSX/TSX mode |
| `@unocss/core` `createGenerator` | Async singleton; call `generate(tokenSet)` per node entry | As of v0.65.0, creation is async — must `await` |
| `@unocss/preset-wind4` | Pass as preset to `createGenerator` config | Required for Tailwind v4 utility compatibility |
| `citty` or `cac` | CLI argument parsing in `src/cli.ts` | Either works; citty aligns with the vite-plus/QwikDev ecosystem |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `index.ts` ↔ `pipeline/*` | Direct function calls; no events | Pipeline stages are pure functions |
| `cli.ts` ↔ `index.ts` | Imports `convert()` from public API only | CLI must not import pipeline internals directly |
| `generator.ts` ↔ UnoCSS | Async init, then synchronous-like `generate()` calls | Generator is stateless for generation; safe to share across files |
| `extractor.ts` ↔ `rewriter.ts` | `NodeEntry[]` array with span data | Extractor produces spans; rewriter consumes them — no feedback loop |
| `variants.ts` ↔ `extractor.ts` | Called after extraction, before generation | Variant resolution is a pre-processing step on extracted token strings |

## Build Order Implications

The component dependency graph dictates build/implementation order:

```
1. types.ts                 (no dependencies)
2. parser.ts                (depends on: oxc-parser)
3. extractor.ts             (depends on: parser output types)
4. namer.ts                 (depends on: NodeEntry type)
5. variants.ts              (depends on: types)
6. generator.ts             (depends on: UnoCSS, variants output)
7. rewriter.ts              (depends on: NodeEntry, namer output, generator output)
8. index.ts                 (depends on: all pipeline stages)
9. cli.ts                   (depends on: index.ts only)
```

This order also suggests the natural phase/milestone sequence: get parsing and extraction working first (verifiable with snapshot tests), then wire in the CSS generator, then the rewriter, and finally the CLI wrapper.

## Sources

- [UnoCSS Core API documentation](https://unocss.dev/tools/core) — `createGenerator` and `generate()` usage
- [UnoCSS presetWind4 documentation](https://unocss.dev/presets/wind4) — Tailwind v4 preset configuration
- [UnoCSS architecture deep-dive (jser.dev)](https://jser.dev/2023-09-17-how-unocss-works-with-vite/) — `generate()` return value internals, layer structure (MEDIUM confidence — 2023 article, cross-checked against UnoCSS DeepWiki)
- [UnoCSS DeepWiki](https://deepwiki.com/unocss/unocss) — pipeline stages, `UnoGenerator` internals
- [Oxc parser guide](https://oxc.rs/docs/guide/usage/parser.html) — `parseSync` API, Visitor pattern
- [Oxc architecture](https://oxc.rs/docs/learn/architecture/parser) — two-phase design, arena allocation
- [oxc-parser npm](https://www.npmjs.com/package/oxc-parser) — Node.js binding API
- [Compiler pipeline patterns (Wikipedia, DeepWiki references)](https://en.wikipedia.org/wiki/Compiler) — parse/extract/transform/generate/emit stage model
- [jscodeshift codemod architecture](https://github.com/facebook/jscodeshift) — span-based rewriting, preserve formatting pattern
- Reference implementation: `tailwind-v4-to-css-converter` (typescript-converter branch) — proven UnoCSS `createGenerator` approach; class extraction via regex (the pattern vanillify improves upon)

---
*Architecture research for: Tailwind CSS to vanilla CSS converter library (vanillify)*
*Researched: 2026-04-04*
