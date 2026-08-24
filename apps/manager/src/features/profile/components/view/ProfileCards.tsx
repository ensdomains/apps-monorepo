import type { ProfileRecords } from '@/features/profile/types'
import { ProfileAddressesSection } from './ProfileAddressesSection'
import { ProfileAgentSection } from './ProfileAgentSection'
import { ProfileContactSection } from './ProfileContactSection'
import { ProfileFeaturedSocialSection } from './ProfileFeaturedSocialSection'
import { ProfileLinksSection } from './ProfileLinksSection'
import { ProfileSocialSection } from './ProfileSocialSection'

type ProfileCardsProps = {
  readonly avatarUrl?: string
  readonly name: string
  readonly records: ProfileRecords
}

export const ProfileCards = ({
  avatarUrl,
  name,
  records,
}: ProfileCardsProps) => (
  <div className="space-y-0">
    <ProfileFeaturedSocialSection records={records} />
    <ProfileContactSection records={records} />
    <ProfileAddressesSection
      avatarUrl={avatarUrl}
      name={name}
      records={records}
    />
    <ProfileSocialSection records={records} />
    <ProfileLinksSection records={records} />
    <ProfileAgentSection records={records} />
  </div>
)
