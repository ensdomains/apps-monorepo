import { Network } from 'lucide-react'
import { useState } from 'react'
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

const NetworkFallback = () => <Network className="size-3/4" />

const AddressIconImage = ({ src }: { readonly src: string }) => {
  const [failed, setFailed] = useState(false)
  if (failed) return <NetworkFallback />

  return (
    <img
      alt=""
      className="size-full object-contain"
      onError={() => setFailed(true)}
      src={src}
    />
  )
}

// Every caller supplies the network name as adjacent text. Keep artwork decorative.
export const AddressIcon = ({ coinType, size = 'sm' }: AddressIconProps) => {
  const { icon: Icon } = getAddressPresentation(coinType)
  const src =
    typeof Icon === 'string'
      ? Icon.startsWith('/') && !Icon.startsWith('//')
        ? Icon
        : safeImageSrc(Icon)
      : undefined
  const sizeClassName = SIZE_CLASS_NAMES[size]

  return (
    <span
      aria-hidden="true"
      className={`inline-flex ${sizeClassName} shrink-0 items-center justify-center overflow-hidden rounded-full bg-ens-quartz-100 text-ens-quartz-500`}
    >
      {typeof Icon === 'function' ? (
        <Icon className="size-full" />
      ) : src ? (
        // A new source gets its own error state, including after an earlier failure.
        <AddressIconImage key={src} src={src} />
      ) : (
        <NetworkFallback />
      )}
    </span>
  )
}
