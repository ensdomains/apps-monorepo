import { useReducedMotion } from 'motion/react'
import { ProfileActionsLoading } from './ProfileActionsLoading'
import { ProfileAddressesSectionLoading } from './ProfileAddressesSectionLoading'
import { ProfileContactSectionLoading } from './ProfileContactSectionLoading'
import {
  ProfileBannerLoading,
  ProfileHeaderLoading,
} from './ProfileHeaderLoading'

type ProfileLoadingProps = {
  readonly name?: string
}

export const ProfileLoading = ({ name }: ProfileLoadingProps) => {
  const shouldReduceMotion = useReducedMotion() ?? false

  return (
    <div className="relative -mt-13.5 profile-desktop:-mt-20 min-h-screen bg-[#FCFBFB] pb-[calc(117px+env(safe-area-inset-bottom,0))] profile-desktop:pb-28.5">
      <ProfileBannerLoading shouldReduceMotion={shouldReduceMotion} />
      <div className="relative z-10 mx-auto -mt-21 profile-desktop:-mt-11.25 w-full max-w-97.5 profile-desktop:max-w-226.25 space-y-0">
        <ProfileHeaderLoading
          name={name}
          shouldReduceMotion={shouldReduceMotion}
        />
        <div className="space-y-0">
          <ProfileContactSectionLoading
            shouldReduceMotion={shouldReduceMotion}
          />
          <ProfileAddressesSectionLoading
            shouldReduceMotion={shouldReduceMotion}
          />
        </div>
      </div>
      <ProfileActionsLoading shouldReduceMotion={shouldReduceMotion} />
    </div>
  )
}
