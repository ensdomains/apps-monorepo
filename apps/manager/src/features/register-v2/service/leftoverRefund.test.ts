import { UserRejectedRequestError } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  FundsHeldForRegistrationError,
  LeftoverFundsWithdrawalError,
} from '@/features/wallet/service/leftoverFunds'
import { TOKENS } from '@/lib/tokens'
import { resolveLeftoverRefundNotice } from './leftoverRefund'

const usdc = (amount: bigint) => ({
  token: TOKENS.USDC.address,
  symbol: TOKENS.USDC.symbol,
  decimals: TOKENS.USDC.decimals,
  amount,
})

describe('resolveLeftoverRefundNotice', () => {
  it.each([
    [
      'says nothing when the account was empty',
      { result: { withdrawn: [] } },
      { kind: 'none' },
    ],
    [
      'names the amount that was sent back',
      { result: { withdrawn: [usdc(12_340_000n)] } },
      { kind: 'returned', amount: '12.34 USDC' },
    ],
    [
      'names the registration still holding the funds',
      {
        error: new FundsHeldForRegistrationError({
          message: 'held',
          registrationName: 'other.eth',
        }),
      },
      { kind: 'held', registrationName: 'other.eth' },
    ],
    [
      'tells a decline in the wallet apart from a failure',
      { error: new UserRejectedRequestError(new Error('User rejected')) },
      { kind: 'declined' },
    ],
    [
      'reports anything else as failed',
      { error: new LeftoverFundsWithdrawalError({ message: 'reverted' }) },
      { kind: 'failed' },
    ],
  ] as const)('%s', (_, settled, expected) => {
    expect(resolveLeftoverRefundNotice(settled)).toEqual(expected)
  })
})
