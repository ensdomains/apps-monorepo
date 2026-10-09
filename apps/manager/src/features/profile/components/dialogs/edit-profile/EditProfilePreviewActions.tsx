import { Trans } from '@lingui/react/macro'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Figma-spec button type and sizes, no matching tokens
const ghostActionClassName =
  'inline-flex h-13.5 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 font-mono text-ens-quartz-900 text-sm uppercase tracking-[0.28px] transition-colors hover:bg-ens-quartz-50 disabled:cursor-wait disabled:opacity-60 lg:landscape:h-12.5 lg:landscape:rounded lg:landscape:px-5 lg:landscape:font-semi-mono lg:landscape:text-xs lg:landscape:tracking-[1.44px]'

interface EditProfilePreviewActionsProps {
  readonly isPublishing: boolean
  readonly isPublishDisabled: boolean
  readonly onDiscard: () => void
  readonly onEdit: () => void
  readonly onPublish: () => void
}

export const EditProfilePreviewActions = ({
  isPublishing,
  isPublishDisabled,
  onDiscard,
  onEdit,
  onPublish,
}: EditProfilePreviewActionsProps) => (
  <>
    <button
      className={ghostActionClassName}
      disabled={isPublishing}
      onClick={onDiscard}
      type="button"
    >
      <Trans>Discard</Trans>
    </button>
    <button
      className={ghostActionClassName}
      disabled={isPublishing}
      onClick={onEdit}
      type="button"
    >
      <Trans>Edit</Trans>
    </button>
    <button
      className={cn(
        ghostActionClassName,
        'gap-2 bg-ens-quartz-900 text-white hover:bg-ens-quartz-700',
      )}
      disabled={isPublishing || isPublishDisabled}
      onClick={onPublish}
      type="button"
    >
      {isPublishing ? (
        <Trans>Publishing…</Trans>
      ) : (
        <>
          <span className="lg:landscape:hidden">
            <Trans>Publish</Trans>
          </span>
          <span className="hidden lg:landscape:inline">
            <Trans>Publish changes</Trans>
          </span>
          <ArrowRight
            aria-hidden
            className="hidden size-4 lg:landscape:block"
          />
        </>
      )}
    </button>
  </>
)
