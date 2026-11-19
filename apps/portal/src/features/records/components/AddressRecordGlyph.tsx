import { getAddressRecordIcon } from '@ens-apps/record-catalog/address-icons'
import type { ReactNode } from 'react'

/** The shared logo for a coin type, or `fallback` when it has none. */
export const AddressRecordGlyph = ({
  coinType,
  fallback,
}: {
  readonly coinType: number
  readonly fallback: ReactNode
}) => {
  const Icon = getAddressRecordIcon(coinType)
  if (Icon === undefined) return fallback
  if (typeof Icon !== 'string') return <Icon className="size-4 text-current" />
  // Lazy, so a long list only fetches the logos scrolled into view.
  return (
    <img
      src={Icon}
      alt=""
      width={20}
      height={20}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="size-full object-contain"
    />
  )
}
