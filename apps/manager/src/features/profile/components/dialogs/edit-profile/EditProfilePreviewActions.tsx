import { Trans } from '@lingui/react/macro'
import { Button } from '@/components/ui/button'
import {
  primaryActionClassName,
  tertiaryActionClassName,
} from '@/features/profile/components/view/ProfileAction.styles'

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
    <Button
      className={tertiaryActionClassName}
      disabled={isPublishing}
      onClick={onDiscard}
      type="button"
      variant="ghost"
    >
      <Trans>Discard</Trans>
    </Button>
    <Button
      className={tertiaryActionClassName}
      disabled={isPublishing}
      onClick={onEdit}
      type="button"
      variant="ghost"
    >
      <Trans>Edit</Trans>
    </Button>
    <Button
      className={primaryActionClassName}
      disabled={isPublishing || isPublishDisabled}
      onClick={onPublish}
      type="button"
      variant="blue"
    >
      {isPublishing ? (
        <Trans>Publishing…</Trans>
      ) : (
        <>
          <span className="xl:hidden">
            <Trans>Publish</Trans>
          </span>
          <span className="hidden xl:inline">
            <Trans>Publish changes</Trans>
          </span>
        </>
      )}
    </Button>
  </>
)
