import { RenewalCompletionBanner } from '../renewing/components/RenewalCompletionBanner'
import { RenewalDetails } from '../renewing/components/RenewalDetails'

export const RenewSuccessStep = () => {
  return (
    <div className="mx-auto mt-12 mb-4 w-full-[32px] max-w-6xl space-y-6.5">
      <RenewalCompletionBanner />
      <RenewalDetails />
    </div>
  )
}
