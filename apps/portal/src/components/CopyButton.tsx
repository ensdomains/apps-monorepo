import { CheckIcon, CopyIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from './ui/button'

// Copy button with checkmark feedback (same pattern as CopyableRecord)
export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (copied) {
      navigator.clipboard.writeText(value)
      const timer = setTimeout(() => setCopied(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [copied, value])

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      onClick={() => setCopied(true)}
    >
      {copied ? (
        <CheckIcon className="size-4" />
      ) : (
        <CopyIcon className="size-4" />
      )}
      <span className="sr-only">Copy value</span>
    </Button>
  )
}
