import { Network } from 'lucide-react'
import { useState } from 'react'
import { match, P } from 'ts-pattern'
import { getAddressPresentation } from '../data/records/address'
import { safeImageSrc } from '../utils/safeUrl'

const SIZE_CLASS_NAMES = {
  xs: 'size-3',
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
} as const

interface AddressIconProps {
  readonly coinType: number
  readonly size?: 'xs' | 'sm' | 'md' | 'lg'
}

type AddressArtwork = ReturnType<typeof getAddressPresentation>['icon']

const isIconComponent = (
  icon: AddressArtwork,
): icon is Exclude<AddressArtwork, string | undefined> =>
  typeof icon === 'function'

const getAddressIconSrc = (icon: AddressArtwork): string | undefined => {
  if (typeof icon !== 'string') return undefined
  if (icon.startsWith('/') && !icon.startsWith('//')) return icon
  return safeImageSrc(icon)
}

const NetworkFallback = () => <Network className="size-3/4" />

const AddressIconImage = ({ src }: { readonly src: string }) => {
  const [hasFailed, setHasFailed] = useState(false)
  if (hasFailed) return <NetworkFallback />

  return (
    <img
      alt=""
      className="size-full object-contain"
      onError={() => setHasFailed(true)}
      src={src}
    />
  )
}

// Every caller supplies the network name as adjacent text. Keep artwork decorative.
export const AddressIcon = ({ coinType, size = 'sm' }: AddressIconProps) => {
  const { icon } = getAddressPresentation(coinType)
  const src = getAddressIconSrc(icon)
  const sizeClassName = SIZE_CLASS_NAMES[size]
  const artwork = match({ icon, src })
    .with({ icon: P.when(isIconComponent) }, ({ icon: Icon }) => (
      <Icon className="size-full" />
    ))
    .with({ src: P.string }, ({ src }) => (
      // A new source gets its own error state, including after an earlier failure.
      <AddressIconImage key={src} src={src} />
    ))
    .otherwise(() => <NetworkFallback />)

  return (
    <span
      aria-hidden="true"
      className={`inline-flex ${sizeClassName} shrink-0 items-center justify-center overflow-hidden rounded-full bg-ens-quartz-100 text-ens-quartz-500`}
    >
      {artwork}
    </span>
  )
}
