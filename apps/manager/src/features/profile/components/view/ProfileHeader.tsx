import type { Address } from 'viem'
import type { ProfileRecords } from '@/features/profile/types'
import { cn } from '@/lib/utils'
import { ProfileAbout } from './ProfileAbout'
import { ProfileAvatar } from './ProfileAvatar'
import { ProfileDetails, ProfileNameBadge } from './ProfileDetails'

type ProfileHeaderProps = {
  readonly avatarUrl?: string
  readonly avatarLoading: boolean
  readonly displayExpiryDate?: Date | null
  readonly hasMobileStatusBanner?: boolean
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
  hasMobileStatusBanner = false,
  mobileActions,
  name,
  owner,
  ownerReverseName,
  records,
  registrationDate,
}: ProfileHeaderProps) => (
  <div
    className={cn(
      'relative min-h-130.75 rounded-none bg-transparent shadow-none xl:min-h-0 xl:space-y-[21.7px] xl:px-8 xl:pt-0',
      hasMobileStatusBanner ? 'pt-0' : 'pt-15.5',
    )}
  >
    <ProfileAvatar
      avatarLoading={avatarLoading}
      avatarUrl={avatarUrl}
      className={cn(
        'xl:hidden',
        hasMobileStatusBanner
          ? 'mx-auto mb-6'
          : 'absolute -top-33 left-1/2 -translate-x-1/2',
      )}
      name={name}
    />
    <div className="flex flex-col items-center xl:block xl:space-y-3.25">
      <ProfileNameBadge name={name} />
      {hasMobileStatusBanner ? (
        <div className="mt-6 w-full px-5 xl:hidden">{mobileActions}</div>
      ) : null}
      <div
        className={cn(
          'w-full px-5 xl:mt-0 xl:px-0',
          hasMobileStatusBanner ? 'mt-6' : 'mt-10',
        )}
      >
        <ProfileDetails
          displayExpiryDate={displayExpiryDate}
          owner={owner}
          ownerReverseName={ownerReverseName}
          registrationDate={registrationDate}
        />
      </div>
      <div className="mt-6 w-[calc(100%-40px)] border-ens-quartz-200 border-t xl:hidden" />
    </div>
    <div
      className={cn(
        'flex flex-col gap-6 px-5 xl:mt-0 xl:flex-row xl:items-stretch xl:px-0',
        hasMobileStatusBanner ? 'mt-6' : 'mt-29',
      )}
    >
      <ProfileAvatar
        avatarLoading={avatarLoading}
        avatarUrl={avatarUrl}
        className="hidden xl:block"
        name={name}
      />
      <ProfileAbout records={records} />
    </div>
  </div>
)
