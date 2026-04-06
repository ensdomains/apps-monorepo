import { ExternalLink } from 'react-external-link'
import type { HttpsUrl } from '@/utils/types'
import { CopyableRecord } from './CopyableRecord'
import { CopyButton } from './CopyButton'
import { EntityBadge, type EntityVariant } from './EntityBadge'

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
        <div className="flex items-center gap-2">
          {href ? (
            <ExternalLink href={href}>
              <EntityBadge variant={variant}>{value}</EntityBadge>
            </ExternalLink>
          ) : (
            <EntityBadge variant={variant}>{value}</EntityBadge>
          )}
          <CopyButton value={value} size="sm" />
        </div>
      ) : (
        <CopyableRecord value={value} href={href} />
      )}
    </>
  )
}
