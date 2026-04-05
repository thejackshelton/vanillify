import { describe, it, expect } from 'vitest'
import { rewrite } from './rewriter'
import { parse } from './parser'
import { extract } from './extractor'
import { assignNames } from './namer'
import type { Warning } from '../types'

/**
 * Helper: run parse -> extract -> assignNames for a source, then call rewrite.
 * This ensures span offsets are always correct (from the actual parser).
 */
async function rewriteFromSource(source: string, filename = 'test.tsx') {
  const { program } = parse(filename, source)
  const { entries, warnings } = extract(program, source)
  const nameMap = assignNames(entries)
  return rewrite(source, entries, nameMap, warnings)
}

describe('rewrite', () => {
  it('replaces static className with indexed name in source', async () => {
    const source = '<div className="flex items-center">hi</div>'
    const result = await rewriteFromSource(source)

    expect(result.component).toContain('"node0"')
    expect(result.component).not.toContain('flex items-center')
  })

  it('generates CSS with .nodeN selector', async () => {
    const source = '<div className="flex p-4">hi</div>'
    const result = await rewriteFromSource(source)

    expect(result.css).toContain('.node0')
    expect(result.css).toContain('display')
    expect(result.css).toContain('padding')
  })

  it('leaves dynamic className expressions unchanged in source', async () => {
    const source = '<div className={active ? "bg-blue-500" : "bg-gray-500"}>hi</div>'
    const result = await rewriteFromSource(source)

    // Dynamic expressions should remain unchanged
    expect(result.component).toContain('active ? "bg-blue-500" : "bg-gray-500"')
  })

  it('handles multiple nodes with separate CSS blocks', async () => {
    const source = '<div className="flex"><span className="text-sm">hi</span></div>'
    const result = await rewriteFromSource(source)

    expect(result.css).toContain('.node0')
    expect(result.css).toContain('.node1')
    expect(result.component).toContain('"node0"')
    expect(result.component).toContain('"node1"')
  })

  it('preserves extraction warnings in output', async () => {
    const warnings: Warning[] = [{
      type: 'dynamic-class',
      message: 'Dynamic expression at 1:15',
      location: { line: 1, column: 15 },
    }]

    const result = await rewrite('<div>hi</div>', [], new Map(), warnings)

    expect(result.warnings).toContain(warnings[0])
  })

  it('handles hover variant producing :hover in CSS', async () => {
    const source = '<button className="bg-blue-500 hover:bg-blue-700">click</button>'
    const result = await rewriteFromSource(source)

    expect(result.css).toContain('.node0')
    expect(result.css).toContain(':hover')
  })

  it('returns empty CSS for source with no class attributes', async () => {
    const source = '<div id="test">no classes</div>'
    const result = await rewriteFromSource(source)

    expect(result.component).toBe(source)
    expect(result.css).toBe('')
    expect(result.warnings).toHaveLength(0)
  })
})
