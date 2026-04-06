import { createRegExp, oneOrMore, whitespace } from "magic-regexp";
import { walk } from "oxc-walker";
import type { NodeEntry, Warning } from "../types";

/** Whitespace split pattern -- shared across all class extraction points */
const WS_RE = createRegExp(oneOrMore(whitespace));

export interface ExtractResult {
  entries: NodeEntry[];
  warnings: Warning[];
  /** Maps containerStart -> boolean indicating if container has unresolvable sub-expressions */
  unresolvableContainers?: Map<number, boolean>;
}

/**
 * A single string literal fragment found inside a dynamic expression.
 */
interface Fragment {
  value: string;
  span: { start: number; end: number };
  isObjectKey?: boolean;
  /** Original identifier name for shorthand properties like { hidden } */
  shorthandOriginal?: string;
}

/**
 * Scan the program body for ImportDeclarations from "tailwind-merge" that import
 * the `twMerge` export (including aliases). Returns a Set of local names bound to
 * the twMerge helper (e.g., Set{"twMerge"} or Set{"tm"} for aliased imports).
 *
 * Per TMR-04: handles `import { twMerge as tm } from "tailwind-merge"` by collecting
 * `spec.local.name` (the alias), not `spec.imported.name`.
 *
 * @param program - ESTree Program node from oxc-parser
 * @returns Set of local identifier names that refer to the twMerge helper
 */
export function findTwMergeNames(program: any): Set<string> {
  const names = new Set<string>();
  for (const node of program.body ?? []) {
    if (
      node.type !== "ImportDeclaration" ||
      node.source?.value !== "tailwind-merge"
    ) continue;
    for (const spec of node.specifiers ?? []) {
      if (
        spec.type === "ImportSpecifier" &&
        spec.imported?.name === "twMerge"
      ) {
        // imported.name = "twMerge" (original export), local.name = local alias (or same)
        names.add(spec.local.name);
      }
    }
  }
  return names;
}

/**
 * Extract class/className attribute values from a parsed JSX/TSX AST.
 * Walks the AST in source order, producing NodeEntry objects for each
 * element with a class or className attribute.
 *
 * @param program - ESTree Program node from oxc-parser
 * @param source - Original source string (for computing line/column from offset)
 * @param twMergeNames - Optional set of local names bound to twMerge from "tailwind-merge"
 * @returns ExtractResult with entries, warnings, and unresolvableContainers
 */
export function extract(program: any, source: string, twMergeNames?: Set<string>): ExtractResult {
  const entries: NodeEntry[] = [];
  const warnings: Warning[] = [];
  const unresolvableContainers = new Map<number, boolean>();
  let nodeIndex = 0;

  walk(program, {
    enter(node: any) {
      if (
        node.type === "JSXAttribute" &&
        node.name?.type === "JSXIdentifier" &&
        (node.name.name === "className" || node.name.name === "class")
      ) {
        // oxc-parser uses 'Literal' for string values (ESTree spec)
        if (node.value?.type === "Literal" && typeof node.value.value === "string") {
          // Static: className="flex bg-red-500"
          const classes = node.value.value.split(WS_RE).filter(Boolean);
          entries.push({
            nodeIndex: nodeIndex++,
            classNames: classes,
            span: { start: node.value.start, end: node.value.end },
            isDynamic: false,
          });
        } else if (node.value?.type === "JSXExpressionContainer") {
          const expression = node.value.expression;
          const containerStart = node.value.start;

          const hasUnresolvable = expressionHasUnresolvable(expression, twMergeNames);
          if (hasUnresolvable) {
            unresolvableContainers.set(containerStart, true);
          }

          const fragments = collectFragments(expression, twMergeNames);
          for (const frag of fragments) {
            const tokens = frag.value.split(WS_RE).filter(Boolean);
            if (tokens.length === 0) continue; // DYN-04: skip empty/whitespace

            entries.push({
              nodeIndex: nodeIndex++,
              classNames: tokens,
              span: frag.span,
              isDynamic: false,
              isFragment: true,
              containerStart,
              isObjectKey: frag.isObjectKey,
              shorthandOriginal: frag.shorthandOriginal,
            });
          }
        }
      }
    },
  });

  return { entries, warnings, unresolvableContainers };
}

/**
 * Recursively collect string Literal fragments from a dynamic expression.
 * Returns one Fragment per string literal node found.
 *
 * When twMergeNames is provided, twMerge calls (by any local alias) are handled
 * specially: all string Literal arguments are joined into a single Fragment whose
 * span covers the entire CallExpression (not individual arg spans). This enables
 * the rewriter to replace the entire call with a single scoped name.
 *
 * Handles: Literal, ConditionalExpression, LogicalExpression, CallExpression, ArrayExpression, ObjectExpression.
 * All other node types (Identifier, MemberExpression, TemplateLiteral with
 * interpolations, SpreadElement, etc.) are unresolvable and return no fragments.
 */
function collectFragments(expression: any, twMergeNames?: Set<string>): Fragment[] {
  const results: Fragment[] = [];
  if (!expression) return results;

  // Unwrap parentheses and TS type wrappers
  if (expression.type === "ParenthesizedExpression") {
    return collectFragments(expression.expression, twMergeNames);
  }
  if (expression.type === "TSAsExpression" || expression.type === "TSNonNullExpression" || expression.type === "TSSatisfiesExpression") {
    return collectFragments(expression.expression, twMergeNames);
  }

  // Non-string literals (boolean, null, number) are harmless no-ops in className -- skip silently
  if (expression.type === "Literal" && typeof expression.value !== "string") {
    return results;
  }

  // String literal leaf -- the rewritable unit
  if (expression.type === "Literal" && typeof expression.value === "string") {
    results.push({ value: expression.value, span: { start: expression.start, end: expression.end } });
    return results;
  }

  // Ternary: recurse both branches
  if (expression.type === "ConditionalExpression") {
    results.push(...collectFragments(expression.consequent, twMergeNames));
    results.push(...collectFragments(expression.alternate, twMergeNames));
    return results;
  }

  // Logical AND / OR / nullish coalescing
  if (expression.type === "LogicalExpression") {
    // For &&: left is a condition, only recurse right (the class value)
    // For || and ??: both sides are class value positions
    if (expression.operator === "&&") {
      results.push(...collectFragments(expression.right, twMergeNames));
    } else {
      results.push(...collectFragments(expression.left, twMergeNames));
      results.push(...collectFragments(expression.right, twMergeNames));
    }
    return results;
  }

  // twMerge call (by any local alias): emit a single Fragment spanning the entire CallExpression.
  // This branch MUST come before the generic CallExpression case.
  // Per TMR-01/TMR-02: join all string Literal args with space; use CallExpression span.
  if (
    expression.type === "CallExpression" &&
    expression.callee?.type === "Identifier" &&
    twMergeNames?.has(expression.callee.name)
  ) {
    const parts: string[] = [];
    for (const arg of expression.arguments ?? []) {
      if (arg.type === "Literal" && typeof arg.value === "string") {
        parts.push(arg.value);
      }
    }
    if (parts.length === 0) return results; // No static string args — nothing to extract
    const joined = parts.join(" ");
    // Span covers the entire CallExpression: twMerge(...) replaced by "nodeN"
    results.push({
      value: joined,
      span: { start: expression.start, end: expression.end },
    });
    return results;
  }

  // Function call (clsx, cn, etc.): recurse into each argument
  if (expression.type === "CallExpression") {
    for (const arg of expression.arguments ?? []) {
      results.push(...collectFragments(arg, twMergeNames));
    }
    return results;
  }

  // Array expression: recurse into each element (clsx(["flex", cond && "hidden"]))
  if (expression.type === "ArrayExpression") {
    for (const elem of expression.elements ?? []) {
      if (elem) results.push(...collectFragments(elem, twMergeNames));
    }
    return results;
  }

  // ObjectExpression: extract Literal and Identifier keys as object key fragments
  if (expression.type === "ObjectExpression") {
    for (const prop of expression.properties ?? []) {
      if (prop.type === "SpreadElement") continue;
      if (prop.computed) continue;
      const key = prop.key;
      let value: string | undefined;
      let span: { start: number; end: number };
      if (key.type === "Literal" && typeof key.value === "string") {
        value = key.value;
        span = { start: key.start, end: key.end };
      } else if (key.type === "Identifier") {
        value = key.name;
        span = { start: key.start, end: key.end };
      } else {
        continue;
      }
      const frag: Fragment = { value, span, isObjectKey: true };
      if (prop.shorthand) {
        frag.shorthandOriginal = key.name;
      }
      results.push(frag);
    }
    return results;
  }

  // All other types (Identifier, MemberExpression, SpreadElement, TemplateLiteral, etc.)
  // are unresolvable -- return empty
  return results;
}

/**
 * Determine whether an expression contains any unresolvable (non-Literal)
 * nodes in class-value positions.
 *
 * When twMergeNames is provided, twMerge calls are checked specifically:
 * a twMerge call is unresolvable if ANY argument is not a plain string Literal.
 *
 * Note: The `test` of a ConditionalExpression and the `left` of a
 * LogicalExpression are conditions, not class values -- they are not counted.
 */
function expressionHasUnresolvable(expression: any, twMergeNames?: Set<string>): boolean {
  if (!expression) return false;

  // Unwrap parentheses and TS type wrappers
  if (expression.type === "ParenthesizedExpression" ||
      expression.type === "TSAsExpression" ||
      expression.type === "TSNonNullExpression" ||
      expression.type === "TSSatisfiesExpression") {
    return expressionHasUnresolvable(expression.expression, twMergeNames);
  }

  // All literals (string, boolean, null, number) are not unresolvable
  if (expression.type === "Literal") {
    return false;
  }

  if (expression.type === "ConditionalExpression") {
    // test is a condition, not a class value -- don't count it
    return expressionHasUnresolvable(expression.consequent, twMergeNames) ||
           expressionHasUnresolvable(expression.alternate, twMergeNames);
  }

  if (expression.type === "LogicalExpression") {
    // For &&: left is a condition, right is the class value
    // For || and ??: both sides are class value positions (fallback pattern)
    if (expression.operator === "&&") {
      return expressionHasUnresolvable(expression.right, twMergeNames);
    }
    return expressionHasUnresolvable(expression.left, twMergeNames) ||
           expressionHasUnresolvable(expression.right, twMergeNames);
  }

  // twMerge call: unresolvable if ANY argument is not a plain string Literal.
  // This branch MUST come before the generic CallExpression case.
  if (
    expression.type === "CallExpression" &&
    expression.callee?.type === "Identifier" &&
    twMergeNames?.has(expression.callee.name)
  ) {
    return (expression.arguments ?? []).some(
      (arg: any) => !(arg.type === "Literal" && typeof arg.value === "string")
    );
  }

  if (expression.type === "CallExpression") {
    // callee is the function, not a class value -- only recurse arguments
    return (expression.arguments ?? []).some((arg: any) => expressionHasUnresolvable(arg, twMergeNames));
  }

  if (expression.type === "ArrayExpression") {
    return (expression.elements ?? []).some((elem: any) => elem && expressionHasUnresolvable(elem, twMergeNames));
  }

  if (expression.type === "ObjectExpression") {
    return (expression.properties ?? []).some((prop: any) => {
      if (prop.type === "SpreadElement") return true;
      if (prop.computed) return true;
      return false;
    });
  }

  // Identifier, MemberExpression, TemplateLiteral with interpolations, SpreadElement, etc.
  // in a class-value position -- unresolvable
  return true;
}

/**
 * Convert a byte offset to line:column position in source.
 */
export function offsetToLineColumn(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 0;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === "\n") {
      line++;
      column = 0;
    } else {
      column++;
    }
  }
  return { line, column };
}
