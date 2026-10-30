import { Trans } from '@lingui/react/macro'
import type { ProfileRecords } from '@/features/profile/types'
import {
  ProfileCard,
  profileRecordGridClassName,
  profileRecordGridItemClassName,
} from './ProfileCard'
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
      <div className={profileRecordGridClassName}>
        {featuredSocials.map((item, index) => (
          <div
            className={profileRecordGridItemClassName(
              index,
              featuredSocials.length,
            )}
            key={item.key}
          >
            <ProfileContactCard
              item={item}
              wide={
                index === featuredSocials.length - 1 &&
                featuredSocials.length % 2 === 1
              }
            />
          </div>
        ))}
      </div>
    </ProfileCard>
  )
}
