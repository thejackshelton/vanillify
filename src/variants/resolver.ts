import type { VariantObject } from '@unocss/core'
import type { CustomVariantsOption } from './types'

/**
 * Create a UnoCSS VariantObject from a variant name and selector template.
 * Stub -- implementation pending (TDD RED phase).
 */
export function createVariantObject(
  _name: string,
  _selectorTemplate: string,
): VariantObject {
  return {
    match: (matcher: string) => matcher,
  }
}

/**
 * Resolve customVariants option to UnoCSS VariantObject array.
 * Stub -- implementation pending (TDD RED phase).
 */
export function resolveCustomVariants(
  _input: CustomVariantsOption,
): VariantObject[] {
  return []
}
