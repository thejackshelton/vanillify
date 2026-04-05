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
export function extract(_program: any, _source: string): ExtractResult {
  // Stub: not yet implemented
  return { entries: [], warnings: [] }
}
