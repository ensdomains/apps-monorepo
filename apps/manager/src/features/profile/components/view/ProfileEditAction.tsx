import type { ReactNode } from 'react'
import type { Address } from 'viem'
import { EditProfileDialog } from '@/features/profile/components/dialogs/edit-profile/EditProfileDialog'
import { normalizeEthName } from '@/features/profile/service/profileName'
import type { ResolverCopySource } from '@/features/profile/service/resolverImport'
import type { ProfileRecords } from '@/features/profile/types'
import type { RenewalProtocol } from '@/features/renew/utils/renewalProtocol'
import { ProfileUpgradePopover } from './ProfileUpgradePopover'

type ProfileEditActionProps = {
  readonly className: string
  readonly canEdit?: boolean
  readonly isInGrace: boolean
  readonly isUpgradeRequired?: boolean
  readonly leftActions?: ReactNode
  readonly name: string
  readonly onUpdated: () => undefined | Promise<unknown>
  readonly owner?: Address
  readonly protocol?: RenewalProtocol
  readonly records: ProfileRecords
  readonly resolverCopySource?: ResolverCopySource
  readonly keepMounted?: boolean
}

export const ProfileEditAction = ({
  canEdit,
  isInGrace,
  isUpgradeRequired = false,
  leftActions,
  name,
  onUpdated,
  owner,
  protocol,
  records,
  className,
  resolverCopySource,
  keepMounted = false,
}: ProfileEditActionProps) => {
  // Imported DNS names are also served by the v1 registry but are editable,
  // so the protocol alone can't decide whether an upgrade is needed.
  const isUnmigratedEthName =
    protocol === 'v1' && normalizeEthName(name) !== null

  if (
    !keepMounted &&
    (isInGrace || (!canEdit && !resolverCopySource && !isUpgradeRequired))
  )
    return null

  if (isUpgradeRequired && !keepMounted) {
    return <ProfileUpgradePopover className={className} />
  }

  if (isUnmigratedEthName && !resolverCopySource && !keepMounted) return null

  return (
    <EditProfileDialog
      canEditNormal={Boolean(canEdit)}
      canStartEdit={
        !isInGrace &&
        !isUpgradeRequired &&
        Boolean(canEdit || resolverCopySource)
      }
      editButtonClassName={className}
      key={name}
      leftActions={leftActions}
      name={name}
      onUpdated={onUpdated}
      owner={owner}
      records={records}
      resolverCopySource={resolverCopySource}
    />
  )
}
