import { describe, it, expect } from 'vite-plus/test'
import { createVariantObject, resolveCustomVariants } from './resolver'

describe('createVariantObject', () => {
  it('returns VariantObject with correct name', () => {
    const variant = createVariantObject('ui-checked', '&[ui-checked]')
    expect(variant.name).toBe('ui-checked')
  })

  it('match strips variant prefix and returns handler', () => {
    const variant = createVariantObject('ui-checked', '&[ui-checked]')
    const result = variant.match('ui-checked:bg-blue-500', {} as any)
    expect(result).toEqual({
      matcher: 'bg-blue-500',
      selector: expect.any(Function),
    })
  })

  it('selector applies self-referencing template (&[attr])', () => {
    const variant = createVariantObject('ui-checked', '&[ui-checked]')
    const result = variant.match('ui-checked:bg-blue-500', {} as any) as { matcher: string; selector: (s: string) => string }
    expect(result.selector('.node0')).toBe('.node0[ui-checked]')
  })

  it('selector applies ancestor-descendant template ([attr] &)', () => {
    const variant = createVariantObject('ui-checked', '[ui-checked] &')
    const result = variant.match('ui-checked:bg-blue-500', {} as any) as { matcher: string; selector: (s: string) => string }
    expect(result.selector('.node0')).toBe('[ui-checked] .node0')
  })

  it('returns matcher string as-is when no prefix match', () => {
    const variant = createVariantObject('ui-checked', '&[ui-checked]')
    const result = variant.match('bg-blue-500', {} as any)
    expect(result).toBe('bg-blue-500')
  })

  it('replaces all & occurrences in selector template', () => {
    const variant = createVariantObject('ui-checked', '& > &')
    const result = variant.match('ui-checked:bg-blue-500', {} as any) as { matcher: string; selector: (s: string) => string }
    expect(result.selector('.node0')).toBe('.node0 > .node0')
  })
})

describe('resolveCustomVariants', () => {
  it('resolves CSS string input to VariantObject[]', () => {
    const css = `
      @custom-variant ui-checked (&[ui-checked]);
      @custom-variant ui-disabled (&[ui-disabled]);
    `
    const variants = resolveCustomVariants(css)
    expect(variants).toHaveLength(2)
    expect(variants[0].name).toBe('ui-checked')
    expect(variants[1].name).toBe('ui-disabled')
  })

  it('resolves Record input to VariantObject[]', () => {
    const input = {
      'ui-checked': '&[ui-checked]',
      'ui-disabled': '&[ui-disabled]',
    }
    const variants = resolveCustomVariants(input)
    expect(variants).toHaveLength(2)
    expect(variants[0].name).toBe('ui-checked')
    expect(variants[1].name).toBe('ui-disabled')
  })

  it('CSS string variants produce correct match behavior', () => {
    const variants = resolveCustomVariants('@custom-variant ui-checked (&[ui-checked]);')
    const result = variants[0].match('ui-checked:bg-blue-500', {} as any) as { matcher: string; selector: (s: string) => string }
    expect(result.matcher).toBe('bg-blue-500')
    expect(result.selector('.node0')).toBe('.node0[ui-checked]')
  })

  it('Record variants produce correct match behavior', () => {
    const variants = resolveCustomVariants({ 'ui-checked': '[ui-checked] &' })
    const result = variants[0].match('ui-checked:bg-blue-500', {} as any) as { matcher: string; selector: (s: string) => string }
    expect(result.matcher).toBe('bg-blue-500')
    expect(result.selector('.node0')).toBe('[ui-checked] .node0')
  })

  it('returns one VariantObject per variant', () => {
    const css = `
      @custom-variant ui-checked (&[ui-checked]);
      @custom-variant ui-disabled (&[ui-disabled]);
      @custom-variant ui-mixed (&[ui-mixed]);
    `
    const variants = resolveCustomVariants(css)
    expect(variants).toHaveLength(3)
    expect(variants.map(v => v.name)).toEqual(['ui-checked', 'ui-disabled', 'ui-mixed'])
  })
})
