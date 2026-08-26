import { Trans } from '@lingui/react/macro'
import type { ProfileRecords } from '@/features/profile/types'
import { ProfileCard } from './ProfileCard'
import { ProfileContactCard } from './ProfileContactSection'
import { getFeaturedSocialItems } from './ProfileView.helpers'

export const ProfileFeaturedSocialSection = ({
  records,
}: {
  readonly records: ProfileRecords
}) => {
  const featuredSocials = getFeaturedSocialItems(records)
  if (featuredSocials.length === 0) return null

  return (
    <ProfileCard title={<Trans>Featured</Trans>}>
      <div className="grid grid-cols-2 gap-3 lg:landscape:grid-cols-3 lg:landscape:gap-6">
        {featuredSocials.map((item) => (
          <ProfileContactCard item={item} key={item.key} />
        ))}
      </div>
    </ProfileCard>
  )
}
