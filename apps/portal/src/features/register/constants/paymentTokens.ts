import type { JSX, SVGProps } from 'react'
import { USDCIcon } from '@/assets/usdc-icon'
import { SUPPORTED_TOKENS, USDC_DECIMALS } from '@/lib/constants/tokens'

export type PaymentToken = {
  readonly symbol: 'USDC' | 'DAI'
  readonly address: (typeof SUPPORTED_TOKENS)[keyof typeof SUPPORTED_TOKENS]
  readonly decimals: number
  readonly Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element
}

/** What the pickers offer. DAI is still a supported token for lookups, but it does not work with the HCA, so only USDC is offered. */
export const PAYMENT_TOKENS = [
  {
    symbol: 'USDC',
    address: SUPPORTED_TOKENS.USDC,
    decimals: USDC_DECIMALS,
    Icon: USDCIcon,
  },
] as const satisfies readonly PaymentToken[]
