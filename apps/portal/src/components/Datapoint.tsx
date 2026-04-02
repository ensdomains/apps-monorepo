import { CheckIcon, CopyIcon } from 'lucide-react'
import { useState } from 'react'
import { ExternalLink } from 'react-external-link'
import type { HttpsUrl } from '@/utils/types'
import { CopyableRecord } from './CopyableRecord'
import { EntityBadge, type EntityVariant } from './EntityBadge'

export type DatapointProps = {
  label: string
  value: string
  info?: string
  href?: HttpsUrl
  variant?: EntityVariant
}

export const Datapoint = ({ label, value, href, variant }: DatapointProps) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
          <button
            type="button"
            className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
          >
            {copied ? (
              <CheckIcon className="size-3" />
            ) : (
              <CopyIcon className="size-3" />
            )}
          </button>
        </div>
      ) : (
        <CopyableRecord value={value} href={href} />
      )}
    </>
  )
}
