import { createFileRoute } from '@tanstack/react-router'
import { PaymentMethodAddScreen } from '@/features/payment/components'

export const Route = createFileRoute('/payment/add')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="max-w-sm my-5 mx-auto">
      <PaymentMethodAddScreen />
    </div>
  )
}
