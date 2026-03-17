import { CheckCircle2 } from 'lucide-react'
import { RegistrationDetails } from '../registering/RegistrationDetails'

export function SuccessStep() {
  return (
    <div className="mx-auto mt-12 w-full max-w-6xl space-y-6.5">
      <div className="flex items-start gap-3 rounded-lg border border-ens-peridot-border bg-ens-peridot-bg p-4">
        <CheckCircle2
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-ens-peridot-text-dark"
        />
        <div className="flex flex-col gap-1">
          <p className="font-medium text-ens-peridot-text-dark text-sm leading-5">
            Registration Complete!
          </p>
          <p className="text-ens-peridot-text-medium text-sm leading-5">
            Your ENS domain has been successfully registered and is now active.
          </p>
        </div>
      </div>
      <RegistrationDetails />
    </div>
  )
}
