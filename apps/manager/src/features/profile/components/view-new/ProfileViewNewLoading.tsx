import { useReducedMotion } from 'motion/react'
import { ProfileViewNewActionsLoading } from './ProfileViewNewActionsLoading'
import { ProfileAddressesSectionLoading } from './ProfileViewNewAddressLoading'
import { ProfileContactSectionLoading } from './ProfileViewNewContactLoading'
import {
  ProfileViewNewBannerLoading,
  ProfileViewNewHeaderLoading,
} from './ProfileViewNewHeaderLoading'
import { ProfileLinksSectionLoading } from './ProfileViewNewLinksLoading'
import { ProfileSocialSectionLoading } from './ProfileViewNewSocialLoading'

type ProfileViewNewLoadingProps = {
  readonly name?: string
}

export const ProfileViewNewLoading = ({ name }: ProfileViewNewLoadingProps) => {
  const shouldReduceMotion = useReducedMotion() ?? false

  return (
    <div className="relative min-h-screen bg-[#FCFBFB] pb-[calc(117px+env(safe-area-inset-bottom,0px))] lg:landscape:pb-[114px]">
      <ProfileViewNewBannerLoading shouldReduceMotion={shouldReduceMotion} />
      <div className="relative z-10 mx-auto -mt-[84px] w-full max-w-[390px] space-y-0 lg:landscape:-mt-[69px] lg:landscape:max-w-226.25">
        <ProfileViewNewHeaderLoading
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
          <ProfileSocialSectionLoading
            shouldReduceMotion={shouldReduceMotion}
          />
          <ProfileLinksSectionLoading shouldReduceMotion={shouldReduceMotion} />
        </div>
      </div>
      <ProfileViewNewActionsLoading shouldReduceMotion={shouldReduceMotion} />
    </div>
  )
}
