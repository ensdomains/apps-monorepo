import { CheckIcon, ClipboardCopyIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export const CopyableRecord = ({
  value,
  className,
}: {
  value: string | number
  className?: string
}) => {
  const [copy, setCopy] = useState(false)

  useEffect(() => {
    if (copy) {
      navigator.clipboard.writeText(value.toString())
    }
  }, [copy, value])

  return (
    <div
      className={cn(
        'flex flex-row gap-2 w-full lg:w-max justify-between',
        className,
      )}
    >
      <span className="font-mono underline decoration-dashed underline-offset-4 truncate max-w-full">
        {value}
      </span>
      <button
        className="cursor-pointer"
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
