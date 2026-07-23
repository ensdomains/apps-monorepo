import type { Address } from 'viem'
import type { ProfileRecords } from '@/features/profile/types'
import { cn } from '@/lib/utils'
import { ProfileViewNewAbout } from './ProfileViewNewAbout'
import { ProfileViewNewAvatar } from './ProfileViewNewAvatar'
import {
  ProfileViewNewDetails,
  ProfileViewNewNameBadge,
} from './ProfileViewNewDetails'

type ProfileViewNewHeaderProps = {
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

export const ProfileViewNewHeader = ({
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
}: ProfileViewNewHeaderProps) => (
  <div
    className={cn(
      'relative min-h-130.75 rounded-none bg-transparent shadow-none lg:landscape:min-h-0 lg:landscape:space-y-[21.7px] lg:landscape:px-8 lg:landscape:pt-0',
      hasMobileStatusBanner ? 'pt-0' : 'pt-15.5',
    )}
  >
    <ProfileViewNewAvatar
      avatarLoading={avatarLoading}
      avatarUrl={avatarUrl}
      className={cn(
        'lg:landscape:hidden',
        hasMobileStatusBanner
          ? 'mx-auto mb-6'
          : 'absolute -top-33 left-1/2 -translate-x-1/2',
      )}
      name={name}
    />
    <div className="flex flex-col items-center lg:landscape:block lg:landscape:space-y-3.25">
      <ProfileViewNewNameBadge name={name} />
      {hasMobileStatusBanner ? (
        <div className="mt-6 w-full px-5 lg:landscape:hidden">
          {mobileActions}
        </div>
      ) : null}
      <div
        className={cn(
          'w-full px-5 lg:landscape:mt-0 lg:landscape:px-0',
          hasMobileStatusBanner ? 'mt-6' : 'mt-10',
        )}
      >
        <ProfileViewNewDetails
          displayExpiryDate={displayExpiryDate}
          owner={owner}
          ownerReverseName={ownerReverseName}
          registrationDate={registrationDate}
        />
      </div>
      <div className="mt-6 w-[calc(100%-40px)] border-ens-quartz-200 border-t lg:landscape:hidden" />
    </div>
    <div
      className={cn(
        'flex flex-col gap-6 px-5 lg:landscape:mt-0 lg:landscape:flex-row lg:landscape:items-stretch lg:landscape:px-0',
        hasMobileStatusBanner ? 'mt-6' : 'mt-29',
      )}
    >
      <ProfileViewNewAvatar
        avatarLoading={avatarLoading}
        avatarUrl={avatarUrl}
        className="hidden lg:landscape:block"
        name={name}
      />
      <ProfileViewNewAbout records={records} />
    </div>
  </div>
)
