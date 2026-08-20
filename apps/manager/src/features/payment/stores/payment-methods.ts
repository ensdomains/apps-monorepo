import { createPersistedStore } from '@/utils/xstate-store'
import type { PaymentMethod } from '../types'

export const paymentMethodsStore = createPersistedStore(
  {
    context: {
      paymentMethods: [] as PaymentMethod[],
    },
    on: {
      add: (context, event: { paymentMethod: PaymentMethod }) => ({
        paymentMethods: [...context.paymentMethods, event.paymentMethod],
      }),
      remove: (context, event: { id: string }) => ({
        paymentMethods: context.paymentMethods.filter(
          (pm) => pm.id !== event.id,
        ),
      }),
      setDefault: (context, event: { index: number }) => {
        // index 0 will be the default payment method so move the item to the first position
        const item = context.paymentMethods[event.index]
        // Returning the same context keeps the snapshot identical, so no
        // subscriber fires and nothing is written back to localStorage.
        if (!item) return context

        return {
          paymentMethods: [
            item,
            ...context.paymentMethods.filter((_, i) => i !== event.index),
          ],
        }
      },
    },
  },
  {
    key: '@manager-v4/payment-methods',
  },
)
