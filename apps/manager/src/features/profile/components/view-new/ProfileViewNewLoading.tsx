import { useReducedMotion } from 'motion/react'
import { ProfileViewNewActionsLoading } from './ProfileViewNewActionsLoading'
import { ProfileAddressesSectionLoading } from './ProfileViewNewAddressLoading'
import { ProfileContactSectionLoading } from './ProfileViewNewContactLoading'
import {
  ProfileViewNewBannerLoading,
  ProfileViewNewHeaderLoading,
} from './ProfileViewNewHeaderLoading'

type ProfileViewNewLoadingProps = {
  readonly name?: string
}

export const ProfileViewNewLoading = ({ name }: ProfileViewNewLoadingProps) => {
  const shouldReduceMotion = useReducedMotion() ?? false

  return (
    <div className="relative min-h-screen bg-[#FCFBFB] pb-[calc(117px+env(safe-area-inset-bottom,0))] lg:landscape:pb-28.5">
      <ProfileViewNewBannerLoading shouldReduceMotion={shouldReduceMotion} />
      <div className="relative z-10 mx-auto -mt-21 w-full max-w-97.5 space-y-0 lg:landscape:-mt-17.25 lg:landscape:max-w-226.25">
        <div aria-hidden="true" className="mb-6 h-0" />
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
        </div>
      </div>
      <ProfileViewNewActionsLoading shouldReduceMotion={shouldReduceMotion} />
    </div>
  )
}
