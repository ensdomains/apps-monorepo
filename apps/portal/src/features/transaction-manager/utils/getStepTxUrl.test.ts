import type { TransactionMachineState } from '@ens-apps/transaction-manager'
import type { Hash } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { getStepTxUrl } from './getStepTxUrl'

const HASH = `0x${'ab'.repeat(32)}` as Hash
const URL = `https://sepolia.etherscan.io/tx/${HASH}`

describe('getStepTxUrl', () => {
  it.each<
    [
      string,
      Hash | undefined,
      TransactionMachineState | undefined,
      boolean,
      string | undefined,
    ]
  >([
    ['links a pending step', HASH, 'pending', false, URL],
    ["hides a Safe's pending safeTxHash", HASH, 'pending', true, undefined],
    ['links a Safe step once it lands', HASH, 'success', true, URL],
    [
      'has nothing to link before a hash',
      undefined,
      'submitting',
      false,
      undefined,
    ],
  ])('%s', (_, hash, status, isSafeWallet, expected) => {
    expect(
      getStepTxUrl({
        chains: [sepolia],
        chainId: sepolia.id,
        hash,
        status,
        isSafeWallet,
      }),
    ).toBe(expected)
  })
})
