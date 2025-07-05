import { PaymentMethodAddScreen } from '@/features/payment/components'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/payment/add')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="max-w-sm mx-auto">
      <PaymentMethodAddScreen />
    </div>
  )
}
