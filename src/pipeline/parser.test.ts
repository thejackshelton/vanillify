import { describe, it, expect } from 'vitest'
import { parse } from './parser'

describe('parse', () => {
  it('parses a simple TSX file into an AST with Program node', () => {
    const source = '<div className="flex">hello</div>'
    const result = parse('test.tsx', source)
    expect(result.program).toBeDefined()
    expect(result.program.type).toBe('Program')
    expect(result.program.body.length).toBeGreaterThan(0)
  })

  it('parses JSX with multiple className attributes', () => {
    const source = `
      const App = () => (
        <div className="flex items-center">
          <span className="text-red-500">hi</span>
        </div>
      )
    `
    const result = parse('test.tsx', source)
    expect(result.program.type).toBe('Program')
  })

  it('throws on invalid syntax', () => {
    const source = '<div className='
    expect(() => parse('test.tsx', source)).toThrow('Parse error')
  })

  it('handles class attribute (not just className)', () => {
    const source = '<div class="flex gap-2">content</div>'
    const result = parse('test.tsx', source)
    expect(result.program).toBeDefined()
  })

  it('does not expose filesystem paths in error messages', () => {
    // T-01-02: Error messages should only include user-provided filename
    const source = '<div className='
    try {
      parse('component.tsx', source)
    } catch (e: any) {
      expect(e.message).toContain('component.tsx')
      expect(e.message).not.toContain(process.cwd())
    }
  })
})
