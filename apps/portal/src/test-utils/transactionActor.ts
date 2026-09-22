/**
 * Drives real transaction-manager actors from a unit test.
 *
 * The flows under test decide whether a step has already run by looking its
 * actor up in the transaction manager, so these tests use the real manager
 * rather than a stub. The wallet is a viem client whose transport answers
 * `eth_sendTransaction` and counts how often it was asked — "the wallet was
 * prompted" is the thing being asserted.
 */

import {
  type EOASigner,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import {
  type Address,
  createWalletClient,
  custom,
  type EIP1193Provider,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
} from 'viem'

export const TEST_CHAIN_ID = 11155111

const TX_HASH = `0x${'ab'.repeat(32)}` as Hash
const TX_TARGET = '0x00000000000000000000000000000000000000ff' as Address

const RECEIPT = {
  status: 'success',
  transactionHash: TX_HASH,
} as TransactionReceipt

/** Only `waitForTransactionReceipt` is reached on the success path. */
const publicClient = {
  waitForTransactionReceipt: async () => RECEIPT,
} as unknown as PublicClient

export type CountingWallet = {
  readonly address: Address
  readonly signer: EOASigner
  /** How many times the wallet has been asked to send a transaction. */
  readonly walletRequests: () => number
}

export function createCountingWallet(address: Address): CountingWallet {
  const methods: string[] = []

  const walletClient = createWalletClient({
    account: address,
    transport: custom({
      request: async ({ method }: { method: string }) => {
        methods.push(method)
        if (method === 'eth_sendTransaction') return TX_HASH
        throw new Error(`Unexpected RPC call in test: ${method}`)
      },
    } as unknown as EIP1193Provider),
  })

  return {
    address,
    signer: { type: 'eoa', walletClient },
    walletRequests: () =>
      methods.filter((method) => method === 'eth_sendTransaction').length,
  }
}

/**
 * Runs one step under `id` and resolves once its actor reaches `success`,
 * leaving the finished actor in the manager exactly as the app does.
 */
export async function runStepToSuccess(
  id: string,
  wallet: CountingWallet,
): Promise<string> {
  const txId = transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: wallet.address,
        to: TX_TARGET,
        data: '0x',
        value: 0n,
        chainId: TEST_CHAIN_ID,
      },
    },
    wallet.signer,
    { id, publicClient, chainId: TEST_CHAIN_ID },
  )

  await waitForTransaction(txId)
  return txId
}

/** Puts the module-level singleton back to a known state between tests. */
export function resetTransactionManager(): void {
  transactionManager.clear()
  transactionManager.setConnectedAccount(undefined)
}
