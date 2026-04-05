import { createGenerator } from '@unocss/core'
import presetWind4 from '@unocss/preset-wind4'
import type { Warning } from '../types'

// Singleton generator instance -- createGenerator is async and expensive
let _generator: Awaited<ReturnType<typeof createGenerator>> | null = null

/**
 * Get or create the singleton UnoCSS generator with preset-wind4.
 */
export async function getGenerator(): Promise<Awaited<ReturnType<typeof createGenerator>>> {
  if (!_generator) {
    _generator = await createGenerator({
      presets: [presetWind4()],
    })
  }
  return _generator
}

export interface GenerateCSSResult {
  /** Raw CSS for all matched tokens (without @layer wrappers) */
  css: string
  /** Tokens that successfully generated CSS */
  matched: Set<string>
  /** Tokens that produced no CSS (coverage gaps) */
  unmatched: string[]
  /** Warnings for unmatched tokens */
  warnings: Warning[]
}

/**
 * Strip @layer wrappers from CSS output, returning only the inner rules.
 */
function stripLayerWrappers(css: string): string {
  // Match @layer <name> { ... } blocks and extract inner content
  const stripped = css.replace(/@layer\s+[\w-]+\s*\{([\s\S]*?)\}\s*$/gm, '$1')
  return stripped.trim()
}

/**
 * Generate CSS from a set of Tailwind class tokens using UnoCSS.
 * Returns raw CSS (no @layer wrappers), matched/unmatched info, and warnings.
 *
 * @param tokens - Set of Tailwind class tokens to generate CSS for
 * @returns GenerateCSSResult with CSS string and match info
 */
export async function generateCSS(tokens: Set<string>): Promise<GenerateCSSResult> {
  const generator = await getGenerator()
  const result = await generator.generate(tokens)

  // Try to get CSS without @layer wrapper; fall back to full CSS and strip manually
  let css = result.css

  // Strip @layer wrappers if present
  const hasLayers = css.includes('@layer')
  if (hasLayers) {
    css = stripLayerWrappers(css)
  }

  // Detect unmatched tokens
  const unmatched = [...tokens].filter(t => !result.matched.has(t))
  const warnings: Warning[] = unmatched.map(token => ({
    type: 'unmatched-class' as const,
    message: `Unmatched Tailwind class: "${token}" -- no CSS generated`,
    location: { line: 0, column: 0 },
  }))

  return {
    css,
    matched: result.matched,
    unmatched,
    warnings,
  }
}

/**
 * Reset the singleton generator (for testing only).
 */
export function resetGenerator(): void {
  _generator = null
}
