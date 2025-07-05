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
    <div className="p-4 border border-gray-200 rounded-md flex items-center gap-3.5">
      <div
        className={clsx(
          'h-7 w-11 rounded-md flex items-center justify-center',
          paymentMethod.type === 'card' && 'bg-gray-200',
          paymentMethod.type === 'google-pay' && 'bg-yellow-500',
          paymentMethod.type === 'apple-pay' && 'bg-gray-500',
          paymentMethod.type === 'paypal' && 'bg-blue-500',
        )}
      >
        <CreditCard className="size-4" />
      </div>
      <div className="flex flex-col gap-1 flex-1">
        <div className="text-sm font-medium space-x-2">
          <span>{paymentMethod.name}</span>
          {paymentMethod.default && (
            <Badge variant="gray">
              <Star /> Default
            </Badge>
          )}
        </div>
        <div className="text-sm text-gray-500">
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
    <div className="space-y-3.5 p-5 border border-gray-200 rounded-md">
      <div>
        <h2 className="text-lg font-medium">Payment Method</h2>
        <div className="text-sm text-gray-500 mb-4">
          This card will be charged for your subscription.
        </div>
      </div>
      <PaymentMethodItem
        key={paymentMethods[0].name}
        paymentMethod={paymentMethods[0]}
      />
      <div className="border-t border-gray-200" />

      {/* Backup card */}
      <div>
        <h3 className="text-sm font-medium">Backup Card</h3>
        <div className="text-sm text-gray-500">
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
    <div className="space-y-3.5 p-5 border border-gray-200 rounded-md">
      <div>
        <h2 className="text-lg font-medium">Payment Methods</h2>
        <div className="text-sm text-gray-500 mb-4">
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
    <div className="space-y-4 flex gap-2 flex-col">
      <h2 className="text-lg font-medium">Add a credit card</h2>
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
        <h2 className="text-lg font-medium">Payment Methods</h2>
        <div className="text-sm text-gray-500 mb-4">
          Choose how you'd like to pay for your subscription.
        </div>
      </div>

      <div className="space-y-3">
        <Button variant="secondary" className="w-full justify-start">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">G</span>
            </div>
            Pay with Google
          </div>
        </Button>

        <Button variant="secondary" className="w-full justify-start">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-black rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">A</span>
            </div>
            Pay with Apple
          </div>
        </Button>

        <Button variant="secondary" className="w-full justify-start">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">P</span>
            </div>
            Pay with PayPal
          </div>
        </Button>
      </div>

      <div className="flex items-center gap-2 justify-center">
        <div className="w-full border-t border-gray-300" />
        <span className="px-2 text-gray-500">or</span>
        <div className="w-full border-t border-gray-300" />
      </div>

      <Button
        variant="default"
        className="w-full"
        onClick={() => setCardDetailsExpanded(true)}
      >
        <PlusIcon />
        Add a credit card
      </Button>

      <div className="flex flex-col gap-2 items-center justify-center text-center leading-ens-tight">
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
