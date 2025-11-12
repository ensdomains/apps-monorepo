import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { copyToClipboard } from '@/lib/clipboard'

interface CopyToClipboardProps {
  value: string
  className?: string
}

export const CopyToClipboard = ({ value, className }: CopyToClipboardProps) => {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const handleClick = async () => {
    await copyToClipboard(value)
    setCopied(true)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Copy to clipboard"
      aria-label="Copy to clipboard"
      className="inline-flex items-center justify-center"
    >
      {copied ? (
        <Check className={className} />
      ) : (
        <Copy className={className} />
      )}
    </button>
  )
}
