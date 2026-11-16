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
  readonly shouldShowFallbackLabel?: boolean
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

const AddressIconFrame = ({
  children,
  size,
}: {
  readonly children: React.ReactNode
  readonly size: keyof typeof SIZE_CLASS_NAMES
}) => (
  <span
    aria-hidden="true"
    className={`inline-flex ${SIZE_CLASS_NAMES[size]} shrink-0 items-center justify-center overflow-hidden rounded-full bg-ens-quartz-100 text-ens-quartz-500`}
  >
    {children}
  </span>
)

const AddressIconImage = ({
  src,
  alt,
  size,
  fallback,
}: {
  readonly src: string
  readonly alt: string
  readonly size: keyof typeof SIZE_CLASS_NAMES
  readonly fallback: React.ReactNode
}) => {
  const [hasFailed, setHasFailed] = useState(false)
  if (hasFailed) return fallback

  return (
    <AddressIconFrame size={size}>
      <img
        alt={alt}
        className="size-full object-contain"
        onError={() => setHasFailed(true)}
        src={src}
      />
    </AddressIconFrame>
  )
}

// Callers supply an adjacent visible or screen-reader name; artwork stays decorative.
export const AddressIcon = ({
  coinType,
  size = 'sm',
  shouldShowFallbackLabel = false,
}: AddressIconProps) => {
  const { icon, label } = getAddressPresentation(coinType)
  const src = getAddressIconSrc(icon)
  const fallback = shouldShowFallbackLabel ? (
    <span
      aria-hidden="true"
      className="min-w-0 whitespace-normal break-words text-xs"
    >
      {label}
    </span>
  ) : (
    <AddressIconFrame size={size}>
      <Network className="size-3/4" />
    </AddressIconFrame>
  )

  return match({ icon, src })
    .with({ icon: P.when(isIconComponent) }, ({ icon: Icon }) => (
      <AddressIconFrame size={size}>
        <Icon className="size-full" />
      </AddressIconFrame>
    ))
    .with({ src: P.string }, ({ src }) => (
      // A new source gets its own error state, including after an earlier failure.
      <AddressIconImage
        alt={shouldShowFallbackLabel ? label : ''}
        fallback={fallback}
        key={src}
        size={size}
        src={src}
      />
    ))
    .otherwise(() => fallback)
}
