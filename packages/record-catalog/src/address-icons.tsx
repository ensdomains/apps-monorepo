import SiBitcoinsv from '@icons-pack/react-simple-icons/icons/SiBitcoinsv'
import SiChianetwork from '@icons-pack/react-simple-icons/icons/SiChianetwork'
import SiSui from '@icons-pack/react-simple-icons/icons/SiSui'
import type { FC } from 'react'
import { getAddressRecordIconKey } from './address'

const ADDRESS_ICON_ASSETS = import.meta.glob<string>(
  './address-assets/*-icon.svg',
  { eager: true, import: 'default', query: '?no-inline' },
)

export const addressIconUrls: Readonly<Record<string, string | undefined>> =
  Object.fromEntries(
    Object.entries(ADDRESS_ICON_ASSETS).map(([path, url]) => [
      path.slice('./address-assets/'.length, -'-icon.svg'.length),
      url,
    ]),
  )

type AddressIconComponent = FC<{ readonly className?: string }>

const ADDRESS_ICON_COMPONENTS: Readonly<
  Record<string, AddressIconComponent | undefined>
> = {
  sui: ({ className }) => <SiSui className={className} color="default" />,
  bsv: ({ className }) => <SiBitcoinsv className={className} color="default" />,
  xch: ({ className }) => (
    <SiChianetwork className={className} color="default" />
  ),
}

export function getAddressRecordIcon(
  coinType: number,
): string | AddressIconComponent | undefined {
  const key = getAddressRecordIconKey(coinType)
  if (key === undefined) return undefined
  return addressIconUrls[key] ?? ADDRESS_ICON_COMPONENTS[key]
}
