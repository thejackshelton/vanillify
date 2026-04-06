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
}

/**
 * Extract class/className attribute values from a parsed JSX/TSX AST.
 * Walks the AST in source order, producing NodeEntry objects for each
 * element with a class or className attribute.
 *
 * @param program - ESTree Program node from oxc-parser
 * @param source - Original source string (for computing line/column from offset)
 * @returns ExtractResult with entries, warnings, and unresolvableContainers
 */
export function extract(program: any, source: string): ExtractResult {
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

          const hasUnresolvable = expressionHasUnresolvable(expression);
          if (hasUnresolvable) {
            unresolvableContainers.set(containerStart, true);
          }

          const fragments = collectFragments(expression);
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
 * Handles: Literal, ConditionalExpression, LogicalExpression, CallExpression.
 * All other node types (Identifier, MemberExpression, TemplateLiteral with
 * interpolations, SpreadElement, etc.) are unresolvable and return no fragments.
 */
function collectFragments(expression: any): Fragment[] {
  const results: Fragment[] = [];
  if (!expression) return results;

  // String literal leaf -- the rewritable unit
  if (expression.type === "Literal" && typeof expression.value === "string") {
    results.push({ value: expression.value, span: { start: expression.start, end: expression.end } });
    return results;
  }

  // Ternary: recurse both branches
  if (expression.type === "ConditionalExpression") {
    results.push(...collectFragments(expression.consequent));
    results.push(...collectFragments(expression.alternate));
    return results;
  }

  // Logical AND / OR / nullish coalescing: recurse both sides
  if (expression.type === "LogicalExpression") {
    results.push(...collectFragments(expression.left));
    results.push(...collectFragments(expression.right));
    return results;
  }

  // Function call (clsx, cn, etc.): recurse into each argument
  if (expression.type === "CallExpression") {
    for (const arg of expression.arguments ?? []) {
      results.push(...collectFragments(arg));
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
      results.push({ value, span, isObjectKey: true });
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
 * Note: The `test` of a ConditionalExpression and the `left` of a
 * LogicalExpression are conditions, not class values -- they are not counted.
 */
function expressionHasUnresolvable(expression: any): boolean {
  if (!expression) return false;

  if (expression.type === "Literal" && typeof expression.value === "string") {
    return false;
  }

  if (expression.type === "ConditionalExpression") {
    // test is a condition, not a class value -- don't count it
    return expressionHasUnresolvable(expression.consequent) ||
           expressionHasUnresolvable(expression.alternate);
  }

  if (expression.type === "LogicalExpression") {
    // left side of && / || is a condition, not a class value -- don't count it
    // right side may carry a class value
    return expressionHasUnresolvable(expression.right);
  }

  if (expression.type === "CallExpression") {
    // callee is the function, not a class value -- only recurse arguments
    return (expression.arguments ?? []).some((arg: any) => expressionHasUnresolvable(arg));
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
