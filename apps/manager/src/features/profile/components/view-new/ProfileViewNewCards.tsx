import type { ProfileRecords } from '@/features/profile/types'
import { ProfileAddressesSection } from './ProfileViewNewAddresses'
import { ProfileContactSection } from './ProfileViewNewContacts'
import { ProfileLinksSection } from './ProfileViewNewLinks'
import { ProfileSocialSection } from './ProfileViewNewSocial'

type ProfileViewNewCardsProps = {
  readonly avatarUrl?: string
  readonly name: string
  readonly records: ProfileRecords
  readonly themeColor?: string
}

export const ProfileViewNewCards = ({
  avatarUrl,
  name,
  records,
  themeColor,
}: ProfileViewNewCardsProps) => (
  <div className="space-y-0">
    <ProfileContactSection records={records} />
    <ProfileAddressesSection
      avatarUrl={avatarUrl}
      name={name}
      records={records}
      themeColor={themeColor}
    />
    <ProfileSocialSection records={records} />
    <ProfileLinksSection records={records} />
  </div>
)
