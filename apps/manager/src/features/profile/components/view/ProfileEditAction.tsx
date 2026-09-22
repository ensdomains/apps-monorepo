import { Trans } from '@lingui/react/macro'
import type { Address } from 'viem'
import { EditProfileDialog } from '@/features/profile/components/dialogs/edit-profile/EditProfileDialog'
import { normalizeEthName } from '@/features/profile/service/profileName'
import type { ProfileRecords } from '@/features/profile/types'
import type { RenewalProtocol } from '@/features/renew/utils/renewalProtocol'
import { ProfileUpgradePopover } from './ProfileUpgradePopover'

type ProfileEditActionProps = {
  readonly className: string
  readonly isInGrace: boolean
  readonly isOwner?: boolean
  readonly isUpgradeRequired?: boolean
  readonly name: string
  readonly onUpdated: () => undefined | Promise<unknown>
  readonly owner?: Address
  readonly protocol?: RenewalProtocol
  readonly records: ProfileRecords
}

export const ProfileEditAction = ({
  isInGrace,
  isOwner,
  isUpgradeRequired = false,
  name,
  onUpdated,
  owner,
  protocol,
  records,
  className,
}: ProfileEditActionProps) => {
  // Imported DNS names are also served by the v1 registry but are editable,
  // so the protocol alone can't decide whether an upgrade is needed.
  const isUnmigratedEthName =
    protocol === 'v1' && normalizeEthName(name) !== null

  if (isInGrace || (!isOwner && !isUpgradeRequired)) return null

  if (isUpgradeRequired || isUnmigratedEthName) {
    return <ProfileUpgradePopover className={className} />
  }

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
