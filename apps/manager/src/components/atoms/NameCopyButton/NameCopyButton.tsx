import { useLingui } from '@lingui/react/macro'
import { MSymbol } from '@/components/ui/material-symbol'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { cn } from '@/lib/utils'

/** Icon button that copies an ENS name and shows a check for a moment. */
export const NameCopyButton = ({
  name,
  className,
}: {
  readonly name: string
  readonly className?: string
}) => {
  const { t } = useLingui()
  const { copied, copy } = useCopyFeedback()

  return (
    <button
      aria-label={`${name} — ${t`Copy to clipboard`}`}
      className={cn(
        'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-sm text-ens-quartz-500 outline-none hover:text-ens-quartz-700 focus-visible:ring-2 focus-visible:ring-ens-lapis-500 focus-visible:ring-inset',
        className,
      )}
      onClick={() => copy(name)}
      title={t`Copy to clipboard`}
      type="button"
    >
      <MSymbol
        aria-hidden
        className="ms-opsz-20 ms-wght-400 text-xl leading-none"
        symbol={copied ? 'check' : 'content_copy'}
      />
    </button>
  )
}
