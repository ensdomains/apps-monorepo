import type { WeaveShaderOptions } from './shader/useWeaveShader'

export const HOUNDSTOOTH_SHIMMER_OPTIONS: WeaveShaderOptions = {
  pattern: 13,
  useAllColorways: true,
  gridSize: 40,
  shimmer: true,
  shimmerWidth: 12,
  shimmerIntensity: 0.6,
}

export const WEAVE_PROGRESS_BAR_OPTIONS: WeaveShaderOptions = {
  pattern: 13,
  useAllColorways: true,
  gridSize: 10,
  shimmer: false,
  bgShade: 4,
}
