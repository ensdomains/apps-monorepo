import type { Address } from 'viem'
import type { ProfileRecords } from '@/features/profile/types'
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
  name,
  owner,
  ownerReverseName,
  records,
  registrationDate,
}: ProfileViewNewHeaderProps) => (
  <div className="relative min-h-[523px] rounded-none bg-transparent pt-[62px] shadow-none lg:landscape:min-h-0 lg:landscape:space-y-[21.7px] lg:landscape:px-8 lg:landscape:pt-0">
    <ProfileViewNewAvatar
      avatarLoading={avatarLoading}
      avatarUrl={avatarUrl}
      className="absolute -top-33 left-1/2 -translate-x-1/2 lg:landscape:hidden"
      name={name}
    />
    <div className="flex flex-col items-center lg:landscape:block lg:landscape:space-y-[13px]">
      <ProfileViewNewNameBadge name={name} />
      <div className="mt-10 w-full px-5 lg:landscape:mt-0 lg:landscape:px-0">
        <ProfileViewNewDetails
          displayExpiryDate={displayExpiryDate}
          owner={owner}
          ownerReverseName={ownerReverseName}
          registrationDate={registrationDate}
        />
      </div>
      <div className="mt-6 w-[calc(100%-40px)] border-ens-quartz-200 border-t lg:landscape:hidden" />
    </div>
    <div className="mt-[91px] flex flex-col gap-6 px-5 lg:landscape:mt-0 lg:landscape:flex-row lg:landscape:items-stretch lg:landscape:px-0">
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
