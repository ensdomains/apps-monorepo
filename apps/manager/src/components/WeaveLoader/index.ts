/**
 * WeaveLoader — registration loader where the name fills out with a woven jacquard shader.
 * Self-contained POC ported from the shader sandbox; intended to be lifted into a package later.
 */

export { NameFill, type NameFillProps } from './NameFill'
export { PATTERNS, type WeavePattern } from './shader/patterns'
export type { WeaveShaderOptions } from './shader/useWeaveShader'
export { WEAVE_DEFAULTS } from './shader/weaveConfig'
export { WeaveCanvas, type WeaveCanvasProps } from './WeaveCanvas'
export { WeaveLoader, type WeaveLoaderProps } from './WeaveLoader'
export { WeaveName, type WeaveNameProps } from './WeaveName'
export {
  stepIndexForProgress,
  stepLabelForProgress,
  WEAVE_STEPS,
  type WeaveStep,
} from './weaveSteps'
