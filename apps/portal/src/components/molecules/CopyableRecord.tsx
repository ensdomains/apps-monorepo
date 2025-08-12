import { CheckIcon, ClipboardCopyIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

export const CopyableRecord = ({ value }: { value: string | number }) => {
  const [copy, setCopy] = useState(false)

  useEffect(() => {
    if (copy) {
      navigator.clipboard.writeText(value.toString())
    }
  }, [copy, value])

  return (
    <div className="flex flex-row gap-2">
      <span className="font-mono underline decoration-dashed underline-offset-4 truncate">
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
