import type { NodeEntry, Warning } from '../types'
import type { NameMap } from './namer'

export interface RewriteResult {
  /** Source with className values replaced by indexed names */
  component: string
  /** Generated vanilla CSS with .nodeN selectors */
  css: string
  /** All warnings (from extraction + generation) */
  warnings: Warning[]
}

/**
 * Rewrite the source component and assemble per-node CSS.
 * Stub -- not yet implemented.
 */
export async function rewrite(
  _source: string,
  _entries: NodeEntry[],
  _nameMap: NameMap,
  _extractWarnings: Warning[]
): Promise<RewriteResult> {
  throw new Error('Not implemented')
}
