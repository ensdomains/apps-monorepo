import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import { copyToClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/utils'

type CopyableButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string
  iconClassName?: string
  variant?: React.ComponentProps<typeof Button>['variant']
}

export const CopyableButton = ({
  value,
  iconClassName,
  variant = 'outline',
  className,
  disabled,
  onClick,
  children,
  title,
  ...props
}: CopyableButtonProps) => {
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
      className={className}
      disabled={isDisabled}
      onClick={handleClick}
      size="sm"
      title={title ?? value}
      type="button"
      variant={variant}
      {...props}
    >
      {children}
      {!isDisabled && (
        <MSymbol
          className={cn(
            'ms-opsz-24 ms-wght-300 text-[24px] leading-none',
            iconClassName,
          )}
          symbol={copied ? 'check' : 'content_copy'}
        />
      )}
    </Button>
  )
}
