import { ProfileSkeletonCardSectionLoading } from './ProfileViewNewSkeletonCardSectionLoading'

export const ProfileSocialSectionLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <ProfileSkeletonCardSectionLoading
    index={3}
    shouldReduceMotion={shouldReduceMotion}
    titleWidth="w-17"
  />
)
