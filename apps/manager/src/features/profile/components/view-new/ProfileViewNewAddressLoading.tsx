import { ProfileSkeletonCardSectionLoading } from './ProfileViewNewSkeletonCardSectionLoading'

export const ProfileAddressesSectionLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <ProfileSkeletonCardSectionLoading
    index={2}
    shouldReduceMotion={shouldReduceMotion}
    titleWidth="w-17"
  />
)
