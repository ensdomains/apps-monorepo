export const CHROMIUM_GRAPHICS_MODES = ['ec2-nvidia', 'software'] as const

export type ChromiumGraphicsMode = (typeof CHROMIUM_GRAPHICS_MODES)[number]

export type GeneratorRuntimeAdapter = 'ec2-nvidia' | 'local-software'

export const runtimeAdapterForGraphicsMode = (
  mode: ChromiumGraphicsMode,
): GeneratorRuntimeAdapter =>
  mode === 'ec2-nvidia' ? 'ec2-nvidia' : 'local-software'
