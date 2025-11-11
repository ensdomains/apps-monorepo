import { CheckIcon, CopyIcon } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { ExternalLink } from 'react-external-link'
import { cn } from '@/lib/utils'

export const CopyableRecord = ({
  value,
  className,
  href,
  displayValue,
  truncate = true,
}: {
  value: string | number
  className?: string
  href?: string
  displayValue?: ReactNode
  truncate?: boolean
}) => {
  const [copy, setCopy] = useState(false)

  useEffect(() => {
    if (copy) navigator.clipboard.writeText(value.toString())
  }, [copy, value])

  const content = displayValue || value

  return (
    <div
      className={cn(
        'flex items-center gap-2 w-full', // changed inline-flex → flex, ensure full width
        className,
      )}
    >
      {href ? (
        <ExternalLink
          className={cn(
            'text-sm sm:text-base font-mono underline decoration-dashed underline-offset-4 flex-1',
            truncate && 'truncate',
          )}
          href={href}
        >
          {content}
        </ExternalLink>
      ) : (
        <div
          className={cn(
            'text-sm sm:text-base font-mono',
            truncate && 'truncate',
          )}
        >
          {content}
        </div>
      )}
      <button
        className="flex-shrink-0 cursor-pointer"
        type="button"
        onClick={() => setCopy(true)}
      >
        {copy ? (
          <CheckIcon className="size-3" />
        ) : (
          <CopyIcon className="size-3" />
        )}
      </button>
    </div>
  )
}
