import { Trans, useLingui } from '@lingui/react/macro'
import { match } from 'ts-pattern'
import { Button } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  actionTooltipClassName,
  primaryActionClassName,
  profileButtonClassName,
  tertiaryActionClassName,
} from '@/features/profile/components/view/ProfileAction.styles'
import { cn } from '@/lib/utils'

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
    <Button
      aria-disabled={!canPreview}
      className={cn(
        profileButtonClassName,
        primaryActionClassName,
        'aria-disabled:cursor-not-allowed',
      )}
      onClick={handlePreviewClick}
      type="button"
      variant="blue"
    >
      <Trans>Preview</Trans>
      <MSymbol
        aria-hidden="true"
        className="ms-opsz-20 text-xs leading-none"
        symbol="arrow_right_alt"
      />
    </Button>
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
        <Button
          className={cn(profileButtonClassName, tertiaryActionClassName)}
          onClick={onCancel}
          type="button"
          variant="ghost"
        >
          <Trans>Cancel</Trans>
        </Button>
        {disabledReason ? (
          <Tooltip>
            <TooltipTrigger asChild>{previewButton}</TooltipTrigger>
            <TooltipContent className={actionTooltipClassName}>
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
