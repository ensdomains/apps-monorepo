import { Trans } from '@lingui/react/macro'
import type { Address } from 'viem'
import { EditProfileDialog } from '@/features/profile/components/dialogs/edit-profile/EditProfileDialog'
import type { ProfileRecords } from '@/features/profile/types'
import type { RenewalProtocol } from '@/features/renew/utils/renewalProtocol'

type ProfileEditActionProps = {
  readonly className: string
  readonly isInGrace: boolean
  readonly isOwner?: boolean
  readonly name: string
  readonly onUpdated: () => undefined | Promise<unknown>
  readonly owner?: Address
  readonly protocol?: RenewalProtocol
  readonly records: ProfileRecords
}

export const ProfileEditAction = ({
  isInGrace,
  isOwner,
  name,
  onUpdated,
  owner,
  protocol,
  records,
  className,
}: ProfileEditActionProps) => {
  // Records live on the v2 resolver, so an unmigrated v1 name has nothing to
  // write to and saving fails. The upgrade banner already says as much.
  if (!isOwner || isInGrace || protocol === 'v1') return null

  const trigger = (
    <button className={className} type="button">
      <Trans>Edit Profile</Trans>
    </button>
  )

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
