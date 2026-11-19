import { getTextRecordIcon } from '@ens-apps/record-catalog/text-icons'
import type { ReactNode } from 'react'

/** The shared logo for a text record key, or `fallback` when it has none. */
export const TextRecordGlyph = ({
  recordKey,
  fallback,
}: {
  readonly recordKey: string
  readonly fallback: ReactNode
}) => {
  const Icon = getTextRecordIcon(recordKey)
  // Monochrome glyphs take the row colour and sit inset to match round coin logos.
  return Icon ? <Icon className="size-4 text-current" /> : fallback
}
