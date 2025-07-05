import clsx from 'clsx'
import {
  ChevronDown,
  CreditCard,
  EllipsisIcon,
  PlusIcon,
  Star,
} from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button, LinkButton } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PaymentMethod } from '../MOCKS'

const PaymentMethodItem = ({
  paymentMethod,
}: {
  paymentMethod: PaymentMethod
}) => {
  return (
    <div className="flex items-center gap-3.5 rounded-md border border-gray-200 p-4">
      <div
        className={clsx(
          'flex h-7 w-11 items-center justify-center rounded-md',
          paymentMethod.type === 'card' && 'bg-gray-200',
          paymentMethod.type === 'google-pay' && 'bg-yellow-500',
          paymentMethod.type === 'apple-pay' && 'bg-gray-500',
          paymentMethod.type === 'paypal' && 'bg-blue-500',
        )}
      >
        <CreditCard className="size-4" />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <div className="space-x-2 font-medium text-sm">
          <span>{paymentMethod.name}</span>
          {paymentMethod.default && (
            <Badge variant="gray">
              <Star /> Default
            </Badge>
          )}
        </div>
        <div className="text-gray-500 text-sm">
          Expires {paymentMethod.expires}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" className="size-7">
          <EllipsisIcon />
        </Button>
      </div>
    </div>
  )
}

export const PaymentMethodList = ({
  paymentMethods,
}: {
  paymentMethods: PaymentMethod[]
}) => {
  return (
    <div className="space-y-3.5 rounded-md border border-gray-200 p-5">
      <div>
        <h2 className="font-medium text-lg">Payment Method</h2>
        <div className="mb-4 text-gray-500 text-sm">
          This card will be charged for your subscription.
        </div>
      </div>
      <PaymentMethodItem
        key={paymentMethods[0].name}
        paymentMethod={paymentMethods[0]}
      />
      <div className="border-gray-200 border-t" />

      {/* Backup card */}
      <div>
        <h3 className="font-medium text-sm">Backup Card</h3>
        <div className="text-gray-500 text-sm">
          If your primary card is declined, we will use this card to charge you.
        </div>
      </div>
      {paymentMethods.length > 1 ? (
        <PaymentMethodItem
          key={paymentMethods[1].name}
          paymentMethod={paymentMethods[1]}
        />
      ) : (
        <Button variant="secondary" className="w-full">
          Add Backup Card
        </Button>
      )}
    </div>
  )
}

export const PaymentMethodAdd = () => {
  return (
    <div className="space-y-3.5 rounded-md border border-gray-200 p-5">
      <div>
        <h2 className="font-medium text-lg">Payment Methods</h2>
        <div className="mb-4 text-gray-500 text-sm">
          This card will be charged for your subscription.
        </div>
      </div>
      <LinkButton to="/payment/add" variant="default" className="w-full">
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
      <Input placeholder="Card number" />
      <div className="flex gap-2">
        <Input placeholder="MM/YY" />
        <Input placeholder="CVV" />
      </div>
      <Input placeholder="Name on card" />
      <div className="flex gap-2">
        <Input placeholder="Zip code" />
        <Input placeholder="Country" />
      </div>
    </div>
  )
}

export const PaymentMethodAddScreen = () => {
  const [cardDetailsExpanded, setCardDetailsExpanded] = useState(false)
  return (
    <div className="space-y-4 px-4">
      <div>
        <h2 className="font-medium text-lg">Payment Methods</h2>
        <div className="mb-4 text-gray-500 text-sm">
          Choose how you'd like to pay for your subscription.
        </div>
      </div>

      <div className="space-y-3">
        <Button variant="secondary" className="w-full justify-start">
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-500">
              <span className="font-bold text-white text-xs">G</span>
            </div>
            Pay with Google
          </div>
        </Button>

        <Button variant="secondary" className="w-full justify-start">
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-black">
              <span className="font-bold text-white text-xs">A</span>
            </div>
            Pay with Apple
          </div>
        </Button>

        <Button variant="secondary" className="w-full justify-start">
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
        variant="default"
        className="w-full"
        onClick={() => setCardDetailsExpanded(true)}
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
        <Button variant="default" className="w-full">
          Confirm
        </Button>
      </div>
    </div>
  )
}
