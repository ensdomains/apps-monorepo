import type { ReactNode } from 'react'
import { PrimaryNameSetupNotice } from '../registering/components/PrimaryNameSetupNotice'
import { RegistrationCompletionBanner } from '../registering/components/RegistrationCompletionBanner'
import { RegistrationDetails } from '../registering/components/RegistrationDetails'

export const SuccessStepLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="mx-auto mt-12 mb-4 w-full-[32px] max-w-6xl space-y-6.5">
      <RegistrationCompletionBanner />
      {children}
    </div>
  )
}

export const SuccessStep = () => (
  <SuccessStepLayout>
    <PrimaryNameSetupNotice />
    <RegistrationDetails />
  </SuccessStepLayout>
)
