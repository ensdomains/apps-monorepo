import type { Address } from 'viem'
import type { HttpsUrl } from '@/utils/types'
import { CopyableRecord } from './CopyableRecord'
import { EntityBadgeWithActions, type EntityVariant } from './EntityBadge'

export type DatapointProps = {
  label: string
  value: string
  info?: string
  href?: HttpsUrl
  variant?: EntityVariant
}

export const Datapoint = ({ label, value, href, variant }: DatapointProps) => {
  return (
    <>
      <span className="text-sm sm:text-base font-medium max-w-160">
        {label}
      </span>
      {variant ? (
        <EntityBadgeWithActions
          variant={variant}
          name={variant === 'name' ? value : undefined}
          address={
            variant === 'address' || variant === 'contract'
              ? (value as Address)
              : undefined
          }
          copyValue={value}
          etherscanHref={href}
        >
          {value}
        </EntityBadgeWithActions>
      ) : (
        <CopyableRecord value={value} href={href} />
      )}
    </>
  )
}
