import { ProfileSkeletonCardSectionLoading } from './ProfileViewNewSkeletonCardSectionLoading'

export const ProfileContactSectionLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <ProfileSkeletonCardSectionLoading
    index={1}
    shouldReduceMotion={shouldReduceMotion}
    titleWidth="w-17"
  />
)
