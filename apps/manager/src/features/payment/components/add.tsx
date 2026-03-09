import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import { ChevronDown, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { Button, LinkButton } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { paymentMethodsStore } from '../stores/payment-methods'

export const PaymentMethodAdd = () => {
  return (
    <div className="space-y-3.5 rounded-md border border-gray-200 p-5">
      <div>
        <h2 className="font-medium text-lg">Payment Methods</h2>
        <div className="mb-4 text-gray-500 text-sm">
          This card will be charged for your subscription.
        </div>
      </div>
      <LinkButton className="w-full" to="/payment/add" variant="default">
        <PlusIcon />
        Add Payment Method
      </LinkButton>
    </div>
  )
}

const PaymentMethodAddScreenCardDetails = () => {
  return (
    <div className="flex flex-col gap-2 space-y-4">
      <h2 className="font-medium text-lg">Add a credit card</h2>
      <Input aria-label="Card number" placeholder="Card number" />
      <div className="flex gap-2">
        <Input aria-label="Card expiry date" placeholder="MM/YY" />
        <Input aria-label="Card security code" placeholder="CVV" />
      </div>
      <Input aria-label="Name on card" placeholder="Name on card" />
      <div className="flex gap-2">
        <Input aria-label="Billing zip code" placeholder="Zip code" />
        <Input aria-label="Billing country" placeholder="Country" />
      </div>
    </div>
  )
}

export const PaymentMethodAddScreen = () => {
  const [cardDetailsExpanded, setCardDetailsExpanded] = useState(false)
  const navigate = useNavigate()
  return (
    <div className="space-y-4 px-4">
      <div>
        <h2 className="font-medium text-lg">Payment Methods</h2>
        <div className="mb-4 text-gray-500 text-sm">
          Choose how you'd like to pay for your subscription.
        </div>
      </div>

      <div className="space-y-3">
        <Button
          className="w-full justify-start"
          onClick={() => {
            paymentMethodsStore.trigger.add({
              paymentMethod: {
                id: `google-${Math.floor(Math.random() * 1000000)}`,
                name: 'Google',
                type: 'google-pay',
                expires: '01/2028',
              },
            })
            navigate({ to: '/payment/list' })
          }}
          variant="secondary"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-500">
              <span className="font-bold text-white text-xs">G</span>
            </div>
            Pay with Google
          </div>
        </Button>

        <Button
          className="w-full justify-start"
          onClick={() => {
            paymentMethodsStore.trigger.add({
              paymentMethod: {
                id: `apple-${Math.floor(Math.random() * 1000000)}`,
                name: 'Apple',
                type: 'apple-pay',
                expires: '01/2028',
              },
            })
            navigate({ to: '/payment/list' })
          }}
          variant="secondary"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-black">
              <span className="font-bold text-white text-xs">A</span>
            </div>
            Pay with Apple
          </div>
        </Button>

        <Button
          className="w-full justify-start"
          onClick={() => {
            paymentMethodsStore.trigger.add({
              paymentMethod: {
                id: `paypal-${Math.floor(Math.random() * 1000000)}`,
                name: 'PayPal',
                type: 'paypal',
                expires: '01/2028',
              },
            })
            navigate({ to: '/payment/list' })
          }}
          variant="secondary"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-600">
              <span className="font-bold text-white text-xs">P</span>
            </div>
            Pay with PayPal
          </div>
        </Button>
      </div>

      <div className="flex items-center justify-center gap-2">
        <div className="w-full border-gray-300 border-t" />
        <span className="px-2 text-gray-500">or</span>
        <div className="w-full border-gray-300 border-t" />
      </div>

      <Button
        className="w-full"
        onClick={() => setCardDetailsExpanded(true)}
        variant="default"
      >
        <PlusIcon />
        Add a credit card
      </Button>

      <div className="flex flex-col items-center justify-center gap-2 text-center leading-ens-tight">
        <div className="font-medium">Add a Backup Payment Method</div>
        <div className="text-gray-500">
          The backup payment method will be charged if the default payment
          method fails.
        </div>

        <ChevronDown
          className={clsx('size-6', cardDetailsExpanded && 'rotate-180')}
          onClick={() => setCardDetailsExpanded(!cardDetailsExpanded)}
        />
      </div>

      {cardDetailsExpanded && <PaymentMethodAddScreenCardDetails />}

      <div className="mt-12">
        <Button
          className="w-full"
          onClick={() => {
            paymentMethodsStore.trigger.add({
              paymentMethod: {
                id: `card-${Math.floor(Math.random() * 1000000)}`,
                name: `Visa **** ${Math.floor(Math.random() * 9000) + 1000}`,
                type: 'card',
                expires: '01/2028',
              },
            })
            navigate({ to: '/payment/list' })
          }}
          variant="default"
        >
          Confirm
        </Button>
      </div>
    </div>
  )
}
