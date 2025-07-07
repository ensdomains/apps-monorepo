import type { PaymentMethod } from './types'

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    name: 'Visa **** 1234',
    type: 'card',
    expires: '01/2025',
    default: true,
  },
  {
    name: 'Google Pay',
    type: 'google-pay',
    expires: '01/2032',
    default: false,
  },
]
