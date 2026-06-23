import { Trans } from '@lingui/react/macro'
import type { Address } from 'viem'
import { LinkButton } from '@/components/ui/button'
import { EditProfileDialog } from '@/features/profile/components/dialogs/edit-profile/EditProfileDialog'
import type { ProfileRecords } from '@/features/profile/types'

type ProfileViewNewEditActionProps = {
  readonly className: string
  readonly isInGrace: boolean
  readonly isOwner?: boolean
  readonly name: string
  readonly onUpdated: () => undefined | Promise<unknown>
  readonly owner?: Address
  readonly profileEditNewEnabled: boolean
  readonly records: ProfileRecords
}

export const ProfileViewNewEditAction = ({
  isInGrace,
  isOwner,
  name,
  onUpdated,
  owner,
  profileEditNewEnabled,
  records,
  className,
}: ProfileViewNewEditActionProps) => {
  if (!isOwner || isInGrace) return null

  const trigger = (
    <button className={className} type="button">
      <Trans>Edit Profile</Trans>
    </button>
  )

  if (profileEditNewEnabled) {
    return (
      <EditProfileDialog
        name={name}
        onUpdated={onUpdated}
        owner={owner}
        records={records}
        trigger={trigger}
      />
    )
  }

  return (
    <LinkButton className={className} params={{ name }} to="/p/$name/edit">
      <Trans>Edit Profile</Trans>
    </LinkButton>
  )
}
