import { CheckIcon, ClipboardCopyIcon, ExternalLink } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export const CopyableRecord = ({
  value,
  className,
  href,
  displayValue,
}: {
  value: string | number
  className?: string
  href?: `https://${string}`
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
        'flex gap-2 w-full items-center', // flex row
        className,
      )}
    >
      {href ? (
        <ExternalLink
          className="flex-1 min-w-0 text-sm sm:text-base font-mono underline decoration-dashed underline-offset-4 truncate"
          href={href}
        >
          {content}
        </ExternalLink>
      ) : (
        <span className="flex-1 min-w-0 text-sm sm:text-base font-mono truncate">
          {content}
        </span>
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
