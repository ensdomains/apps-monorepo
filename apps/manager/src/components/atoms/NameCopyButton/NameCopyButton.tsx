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
      aria-label={t`Copy to clipboard`}
      className={cn(
        'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-sm text-ens-quartz-500 hover:text-ens-quartz-700 focus-visible:outline-2 focus-visible:outline-ens-lapis-core',
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
