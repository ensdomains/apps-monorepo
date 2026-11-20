import type { PaletteTargetMetadata } from '@/features/command-palette/core/types'

type NameTargetMetadata = PaletteTargetMetadata & {
  readonly entity: { readonly type: 'name'; readonly name: string }
}

export const isNameTargetNotKnownAvailable = (
  target: PaletteTargetMetadata,
): target is NameTargetMetadata =>
  target.entity.type === 'name' && target.isAvailable !== true

export const isKnownAvailableNameTarget = (
  target: PaletteTargetMetadata,
): boolean => target.entity.type === 'name' && target.isAvailable === true
