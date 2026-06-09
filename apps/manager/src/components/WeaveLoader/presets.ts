/**
 * Reusable weave fabric presets for WeaveCanvas / WeaveName / NameFill.
 */
import type { WeaveShaderOptions } from './shader/useWeaveShader'

/**
 * Houndstooth + shimmer, multi-colorway (pink/blue) — the fabric shown in the
 * registration square in Figma. `pattern: 13` = Houndstooth in PATTERNS.
 */
export const HOUNDSTOOTH_SHIMMER_OPTIONS: WeaveShaderOptions = {
  pattern: 13,
  useAllColorways: true,
  gridSize: 40,
  shimmer: true,
  shimmerWidth: 12,
  shimmerIntensity: 0.6,
}
