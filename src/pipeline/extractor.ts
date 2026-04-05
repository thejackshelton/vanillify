import { walk } from 'oxc-walker'
import type { NodeEntry, Warning } from '../types'

export interface ExtractResult {
  entries: NodeEntry[]
  warnings: Warning[]
}

/**
 * Extract class/className attribute values from a parsed JSX/TSX AST.
 * Walks the AST in source order, producing NodeEntry objects for each
 * element with a class or className attribute.
 *
 * @param program - ESTree Program node from oxc-parser
 * @param source - Original source string (for computing line/column from offset)
 * @returns ExtractResult with entries and warnings
 */
export function extract(program: any, source: string): ExtractResult {
  const entries: NodeEntry[] = []
  const warnings: Warning[] = []
  let nodeIndex = 0

  walk(program, {
    enter(node: any) {
      if (
        node.type === 'JSXAttribute'
        && node.name?.type === 'JSXIdentifier'
        && (node.name.name === 'className' || node.name.name === 'class')
      ) {
        // oxc-parser uses 'Literal' for string values (ESTree spec)
        if (node.value?.type === 'Literal' && typeof node.value.value === 'string') {
          // Static: className="flex bg-red-500"
          const classes = node.value.value.split(/\s+/).filter(Boolean)
          entries.push({
            nodeIndex: nodeIndex++,
            classNames: classes,
            span: { start: node.value.start, end: node.value.end },
            isDynamic: false,
          })
        }
        else if (node.value?.type === 'JSXExpressionContainer') {
          // Dynamic expression -- extract what we can, mark as dynamic
          const fragments = extractStaticFragments(node.value.expression)
          const loc = offsetToLineColumn(source, node.value.start)
          entries.push({
            nodeIndex: nodeIndex++,
            classNames: fragments,
            span: { start: node.value.start, end: node.value.end },
            isDynamic: true,
          })
          warnings.push({
            type: 'dynamic-class',
            message: `Dynamic class expression at ${loc.line}:${loc.column} — extracted ${fragments.length} static fragments`,
            location: loc,
          })
        }
      }
    },
  })

  return { entries, warnings }
}

/**
 * Attempt to extract string literal fragments from dynamic expressions.
 * Handles: ternary branches, logical AND right-hand side, template literal quasis.
 * Returns class tokens found in static parts.
 *
 * T-01-04: Returns empty array for unrecognized node types -- never throws.
 */
function extractStaticFragments(expression: any): string[] {
  const fragments: string[] = []

  if (!expression) return fragments

  // String literal (ESTree 'Literal' with string value): className={"flex bg-red-500"}
  if (expression.type === 'Literal' && typeof expression.value === 'string') {
    fragments.push(...expression.value.split(/\s+/).filter(Boolean))
  }
  // Ternary: className={cond ? "a b" : "c d"}
  else if (expression.type === 'ConditionalExpression') {
    fragments.push(...extractStaticFragments(expression.consequent))
    fragments.push(...extractStaticFragments(expression.alternate))
  }
  // Logical AND: className={cond && "a b"}
  else if (expression.type === 'LogicalExpression') {
    fragments.push(...extractStaticFragments(expression.right))
    if (expression.left.type === 'Literal' && typeof expression.left.value === 'string') {
      fragments.push(...extractStaticFragments(expression.left))
    }
  }
  // Template literal: className={`flex ${var}`} -- extract static quasis
  else if (expression.type === 'TemplateLiteral') {
    for (const quasi of expression.quasis ?? []) {
      if (quasi.value?.cooked) {
        fragments.push(...quasi.value.cooked.split(/\s+/).filter(Boolean))
      }
    }
  }
  // CallExpression, MemberExpression, etc. -- unrecognized, return empty
  // This is intentional: function calls like clsx() can't be statically analyzed

  return fragments
}

/**
 * Convert a byte offset to line:column position in source.
 */
function offsetToLineColumn(source: string, offset: number): { line: number; column: number } {
  let line = 1
  let column = 0
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line++
      column = 0
    }
    else {
      column++
    }
  }
  return { line, column }
}
