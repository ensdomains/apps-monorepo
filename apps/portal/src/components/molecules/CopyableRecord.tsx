import { CheckIcon, ClipboardCopyIcon } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { ExternalLink } from 'react-external-link'
import { cn } from '@/lib/utils'

export const CopyableRecord = ({
  value,
  className,
  href,
  displayValue,
}: {
  value: string | number
  className?: string
  href?: string
  displayValue?: ReactNode
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
          className="text-sm sm:text-base font-mono underline decoration-dashed underline-offset-4 truncate flex-1"
          href={href}
        >
          {content}
        </ExternalLink>
      ) : (
        <div className="text-sm sm:text-base font-mono truncate flex-1">
          {content}
        </div>
      )}
      <button
        className="flex-shrink-0 cursor-pointer"
        type="button"
        onClick={() => setCopy(true)}
      >
        {copy ? (
          <CheckIcon height={16} width={16} />
        ) : (
          <ClipboardCopyIcon height={16} width={16} />
        )}
      </button>
    </div>
  )
}
