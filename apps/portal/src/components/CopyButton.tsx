import { CheckIcon, CopyIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from './ui/button'

// Copy button with checkmark feedback (same pattern as CopyableRecord)
export const CopyButton = ({
  value,
  size = 'default',
}: {
  value: string
  size?: 'default' | 'sm'
}) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await navigator.clipboard.writeText(value)
    setCopied(true)
  }

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [copied])

  if (size === 'sm') {
    return (
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
        <span className="sr-only">Copy value</span>
      </button>
    )
  }

  return (
    <Button variant="ghost" size="icon" className="size-8" onClick={handleCopy}>
      {copied ? (
        <CheckIcon className="size-4" />
      ) : (
        <CopyIcon className="size-4" />
      )}
      <span className="sr-only">Copy value</span>
    </Button>
  )
}
