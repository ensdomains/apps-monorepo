import { useSelector } from '@xstate/store-react'
import clsx from 'clsx'
import { CreditCard, EllipsisIcon, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, LinkButton } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { paymentMethodsStore } from '../stores/payment-methods'
import type { PaymentMethod } from '../types'

const PaymentMethodItem = ({
  paymentMethod,
  isDefault,
}: {
  paymentMethod: PaymentMethod
  isDefault?: boolean
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
          {isDefault && (
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Payment method options"
              size="icon"
              variant="secondary"
            >
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onSelect={() => {
                paymentMethodsStore.trigger.remove({ id: paymentMethod.id })
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export const PaymentMethodList = () => {
  const paymentMethods = useSelector(
    paymentMethodsStore,
    (state) => state.context.paymentMethods,
  )

  const defaultPaymentMethod = paymentMethods[0]
  const backupPaymentMethods = paymentMethods.slice(1)

  return (
    <div className="space-y-3.5 rounded-md border border-gray-200 p-5">
      <div>
        <h2 className="font-medium text-lg">Payment Method</h2>
        <div className="mb-4 text-gray-500 text-sm">
          This card will be charged for your subscription.
        </div>
      </div>
      {defaultPaymentMethod ? (
        <PaymentMethodItem
          isDefault
          key={defaultPaymentMethod.id}
          paymentMethod={defaultPaymentMethod}
        />
      ) : (
        <div className="text-gray-500">No default payment method set.</div>
      )}
      <div className="border-gray-200 border-t" />

      {/* Backup card */}
      <div>
        <h3 className="font-medium text-sm">Backup Card</h3>
        <div className="text-gray-500 text-sm">
          If your primary card is declined, we will use this card to charge you.
        </div>
      </div>
      {backupPaymentMethods.length > 0 ? (
        backupPaymentMethods.map((pm) => (
          <PaymentMethodItem key={pm.id} paymentMethod={pm} />
        ))
      ) : (
        <LinkButton className="w-full" to="/payment/add" variant="secondary">
          Add Backup Card
        </LinkButton>
      )}
    </div>
  )
}
