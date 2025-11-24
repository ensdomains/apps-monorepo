import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { copyToClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/utils'

type CopyableButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string
  iconClassName?: string
}

export function CopyableButton({
  value,
  iconClassName,
  className,
  disabled,
  onClick,
  children,
  title,
  ...props
}: CopyableButtonProps) {
  const [copied, setCopied] = useState(false)

  const isDisabled = disabled || !value

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = async (e) => {
    onClick?.(e)
    if (e.defaultPrevented || isDisabled) return
    await copyToClipboard(value)
    setCopied(true)
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={handleClick}
      disabled={isDisabled}
      title={title ?? value}
      {...props}
    >
      {children}
      {!isDisabled &&
        (copied ? (
          <Check className={cn('ml-1', iconClassName)} />
        ) : (
          <Copy className={cn('ml-1', iconClassName)} />
        ))}
    </Button>
  )
}
