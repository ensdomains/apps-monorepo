import { describe, expect, it } from 'vitest'
import {
  type PrimaryNamePayment,
  type PrimaryNamePaymentInputs,
  selectPrimaryNamePayment,
} from './primaryNamePayment'

const run = (overrides: Partial<PrimaryNamePaymentInputs>) =>
  selectPrimaryNamePayment({
    hcaUsdc: 0n,
    walletUsdc: 0n,
    feeUsdc: 200_000n,
    walletEth: 10n ** 16n,
    ethCost: 10n ** 15n,
    ...overrides,
  })

describe('selectPrimaryNamePayment', () => {
  it.each<{
    readonly case: string
    readonly inputs: Partial<PrimaryNamePaymentInputs>
    readonly expected: PrimaryNamePayment
  }>([
    {
      case: 'the HCA covers the fee',
      inputs: { hcaUsdc: 200_000n },
      expected: 'usdc',
    },
    {
      case: 'the HCA and the wallet cover the fee together, with no ETH',
      inputs: { hcaUsdc: 50_000n, walletUsdc: 150_000n, walletEth: 0n },
      expected: 'usdc',
    },
    {
      case: 'no USDC anywhere, enough ETH',
      inputs: { feeUsdc: null },
      expected: 'eth',
    },
    {
      case: 'some USDC, short of the fee, enough ETH',
      inputs: { hcaUsdc: 50_000n, walletUsdc: 100_000n },
      expected: 'eth',
    },
    {
      case: 'USDC held but the fee could not be quoted, enough ETH',
      inputs: { hcaUsdc: 200_000n, feeUsdc: null },
      expected: 'eth',
    },
    {
      case: 'no USDC and ETH short of the cost',
      inputs: { walletEth: 10n ** 14n },
      expected: 'usdc',
    },
    {
      case: 'no USDC and the ETH cost could not be estimated',
      inputs: { ethCost: null },
      expected: 'usdc',
    },
    {
      case: 'USDC covers the fee and the wallet ETH is unread',
      inputs: { walletUsdc: 200_000n, walletEth: null },
      expected: 'usdc',
    },
    {
      case: 'the HCA covers the fee and the wallet USDC is unread',
      inputs: { hcaUsdc: 200_000n, walletUsdc: null },
      expected: 'usdc',
    },
    {
      case: 'the HCA is short, the wallet USDC is unread, enough ETH',
      inputs: { hcaUsdc: 50_000n, walletUsdc: null },
      expected: 'eth',
    },
  ])('$case → $expected', ({ inputs, expected }) => {
    expect(run(inputs)).toBe(expected)
  })
})
