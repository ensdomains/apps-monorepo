import type { Address } from 'viem'
import type { ProfileRecords } from '@/features/profile/types'
import { ProfileAbout } from './ProfileAbout'
import { ProfileAvatar } from './ProfileAvatar'
import { ProfileDetails, ProfileNameBadge } from './ProfileDetails'

type ProfileHeaderProps = {
  readonly avatarUrl?: string
  readonly avatarLoading: boolean
  readonly displayExpiryDate?: Date | null
  readonly canEdit?: boolean
  readonly desktopActions?: React.ReactNode
  readonly mobileActions?: React.ReactNode
  readonly name: string
  readonly owner?: Address
  readonly ownerReverseName?: string | null
  readonly records: ProfileRecords
  readonly registrationDate?: number | null
}

export const ProfileHeader = ({
  avatarLoading,
  avatarUrl,
  displayExpiryDate,
  canEdit,
  desktopActions,
  mobileActions,
  name,
  owner,
  ownerReverseName,
  records,
  registrationDate,
}: ProfileHeaderProps) => (
  <div className="relative min-h-130.75 rounded-none bg-transparent pt-0 shadow-none xl:min-h-0 xl:space-y-[21.7px] xl:px-8 xl:pt-0">
    <ProfileAvatar
      avatarLoading={avatarLoading}
      avatarUrl={avatarUrl}
      className="mx-auto mb-6 xl:hidden"
      name={name}
    />
    <div className="flex flex-col items-center xl:block xl:space-y-3.25">
      <ProfileNameBadge name={name} />
      {mobileActions ? (
        <div className="mt-6 w-full px-5 xl:hidden">{mobileActions}</div>
      ) : null}
      <div className="mt-8 flex w-full items-start justify-between gap-4 px-5 xl:mt-0 xl:px-0">
        <ProfileDetails
          displayExpiryDate={displayExpiryDate}
          owner={owner}
          ownerReverseName={ownerReverseName}
          registrationDate={registrationDate}
        />
        {desktopActions}
      </div>
      <div className="mt-6 w-[calc(100%-40px)] border-ens-quartz-200 border-t xl:hidden" />
    </div>
    <div className="mt-6 flex flex-col gap-6 px-5 xl:mt-0 xl:flex-row xl:items-stretch xl:px-0">
      <ProfileAvatar
        avatarLoading={avatarLoading}
        avatarUrl={avatarUrl}
        className="hidden xl:block xl:size-40"
        name={name}
      />
      <ProfileAbout canEdit={canEdit} records={records} />
    </div>
  </div>
)
