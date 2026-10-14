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
      'relative min-h-130.75 profile-desktop:min-h-0 profile-desktop:space-y-[21.7px] rounded-none bg-transparent profile-desktop:px-8 profile-desktop:pt-0 shadow-none',
      hasMobileStatusBanner ? 'pt-0' : 'pt-15.5',
    )}
  >
    <ProfileAvatar
      avatarLoading={avatarLoading}
      avatarUrl={avatarUrl}
      className={cn(
        'profile-desktop:hidden',
        hasMobileStatusBanner
          ? 'mx-auto mb-6'
          : 'absolute -top-33 left-1/2 -translate-x-1/2',
      )}
      name={name}
    />
    <div className="profile-desktop:block flex flex-col items-center profile-desktop:space-y-3.25">
      <ProfileNameBadge name={name} />
      {hasMobileStatusBanner ? (
        <div className="mt-6 profile-desktop:hidden w-full px-5">
          {mobileActions}
        </div>
      ) : null}
      <div
        className={cn(
          'profile-desktop:mt-0 w-full profile-desktop:px-0 px-5',
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
      <div className="mt-6 profile-desktop:hidden w-[calc(100%-40px)] border-ens-quartz-200 border-t" />
    </div>
    <div
      className={cn(
        'profile-desktop:mt-0 flex profile-desktop:flex-row flex-col profile-desktop:items-stretch gap-6 profile-desktop:px-0 px-5',
        hasMobileStatusBanner ? 'mt-6' : 'mt-29',
      )}
    >
      <ProfileAvatar
        avatarLoading={avatarLoading}
        avatarUrl={avatarUrl}
        className="profile-desktop:block hidden"
        name={name}
      />
      <ProfileAbout records={records} />
    </div>
  </div>
)
