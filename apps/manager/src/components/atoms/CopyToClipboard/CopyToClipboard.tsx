import { Check, Copy } from 'lucide-react'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'

interface CopyToClipboardProps {
  value: string
  className?: string
}

export const CopyToClipboard = ({ value, className }: CopyToClipboardProps) => {
  const { copied, copy } = useCopyFeedback()

  return (
    <button
      aria-label="Copy to clipboard"
      className="inline-flex items-center justify-center"
      onClick={() => copy(value)}
      title="Copy to clipboard"
      type="button"
    >
      {copied ? (
        <Check className={className} />
      ) : (
        <Copy className={className} />
      )}
    </button>
  )
}
