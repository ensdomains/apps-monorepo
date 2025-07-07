import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import {
  AutoRenewalItem,
  NonAutoRenewalWarning,
} from '@/features/auto-renewal/components'
import { NON_AUTO_RENEWALS, RENEWALS } from '@/features/auto-renewal/MOCKS'
import {
  PaymentMethodAdd,
  PaymentMethodList,
} from '@/features/payment/components'
import { PAYMENT_METHODS } from '@/features/payment/MOCKS'

export const Route = createFileRoute('/auto-renewal/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="mx-auto my-5 max-w-sm space-y-4">
      <NonAutoRenewalWarning nonAutoRenewals={NON_AUTO_RENEWALS} />
      <h1 className="font-bold text-2xl">Manage Renewals</h1>
      <div className="space-y-4">
        {RENEWALS.map((renewal) => (
          <AutoRenewalItem key={renewal.name} autoRenewal={renewal} />
        ))}
      </div>
      <PaymentMethodAdd />
      <PaymentMethodList paymentMethods={PAYMENT_METHODS} />
      <Button variant="default" className="w-full" size="lg">
        Confirm
      </Button>
    </div>
  )
}
