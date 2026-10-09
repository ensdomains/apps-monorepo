import { Trans, useLingui } from '@lingui/react/macro'
import { ArrowRight } from 'lucide-react'
import { match } from 'ts-pattern'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// Figma-spec button type: the tracking values have no matching tokens
const footerButtonClassName =
  'inline-flex h-12.5 items-center justify-center rounded px-5 font-mono text-sm uppercase tracking-[0.28px] transition-colors md:font-semi-mono md:text-xs md:tracking-[1.44px]'

interface EditProfileDialogFooterProps {
  readonly canPreview: boolean
  readonly errorTabLabels: readonly string[]
  readonly hasChanges: boolean
  readonly onCancel: () => void
  readonly onPreview: () => void
  readonly onShowErrors: () => void
}

export const EditProfileDialogFooter = ({
  canPreview,
  errorTabLabels,
  hasChanges,
  onCancel,
  onPreview,
  onShowErrors,
}: EditProfileDialogFooterProps) => {
  const { t } = useLingui()
  const hasErrors = errorTabLabels.length > 0
  const tabList = new Intl.ListFormat(undefined, {
    style: 'long',
    type: 'conjunction',
  }).format(errorTabLabels)
  const disabledReason = match({ hasChanges, hasErrors })
    .with(
      { hasErrors: true },
      () => t`Resolve errors before previewing changes.`,
    )
    .with(
      { hasChanges: false },
      () =>
        t`You haven't made changes yet. Edit your profile then click here to preview those changes.`,
    )
    .otherwise(() => undefined)

  const handlePreviewClick = () => {
    if (canPreview) onPreview()
    else if (hasErrors) onShowErrors()
  }

  const previewButton = (
    <button
      aria-disabled={!canPreview}
      className={cn(
        footerButtonClassName,
        'gap-2 text-white',
        canPreview
          ? 'bg-ens-quartz-900 hover:bg-ens-quartz-700'
          : 'cursor-not-allowed bg-ens-quartz-100 text-ens-quartz-400',
      )}
      onClick={handlePreviewClick}
      type="button"
    >
      <Trans>Preview</Trans>
      <ArrowRight aria-hidden className="size-4" />
    </button>
  )

  return (
    <div className="flex shrink-0 flex-col gap-3 border-ens-quartz-200 border-t px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
      <p
        aria-live="polite"
        className="min-w-0 font-mono text-ens-error text-xs leading-normal"
        role={hasErrors ? 'alert' : undefined}
      >
        {hasErrors ? (
          <Trans>
            Complete required field in <strong>{tabList}</strong> before
            previewing and publishing
          </Trans>
        ) : null}
      </p>
      <div className="flex shrink-0 items-center justify-end gap-3">
        <button
          className={cn(
            footerButtonClassName,
            'text-ens-quartz-900 hover:bg-ens-quartz-50',
          )}
          onClick={onCancel}
          type="button"
        >
          <Trans>Cancel</Trans>
        </button>
        {disabledReason ? (
          <Tooltip>
            <TooltipTrigger asChild>{previewButton}</TooltipTrigger>
            <TooltipContent className="max-w-64">
              {disabledReason}
            </TooltipContent>
          </Tooltip>
        ) : (
          previewButton
        )}
      </div>
    </div>
  )
}
