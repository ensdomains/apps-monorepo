import type { ProfileRecords } from '@/features/profile/types'
import { ProfileAddressesSection } from './ProfileViewNewAddresses'
import { ProfileContactSection } from './ProfileViewNewContacts'
import { ProfileLinksSection } from './ProfileViewNewLinks'
import { ProfileSocialSection } from './ProfileViewNewSocial'

type ProfileViewNewCardsProps = {
  readonly avatarUrl?: string
  readonly name: string
  readonly records: ProfileRecords
}

export const ProfileViewNewCards = ({
  avatarUrl,
  name,
  records,
}: ProfileViewNewCardsProps) => (
  <div className="space-y-0">
    <ProfileContactSection records={records} />
    <ProfileAddressesSection
      avatarUrl={avatarUrl}
      name={name}
      records={records}
    />
    <ProfileSocialSection records={records} />
    <ProfileLinksSection records={records} />
  </div>
)
