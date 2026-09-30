/**
 * Drives real transaction-manager actors from a unit test.
 *
 * Flows decide whether a step has already run by looking its actor up in the
 * manager, so tests of that behaviour use the real manager rather than a stub.
 * The wallet is a viem client whose transport answers `eth_sendTransaction`
 * and counts how often it was asked — "the wallet was prompted" is usually the
 * thing being asserted.
 *
 * Lives in the package so the package's own tests and its consumers' tests
 * drive an actor through exactly the same lifecycle.
 */

import {
  type Address,
  createWalletClient,
  custom,
  type EIP1193Provider,
  type Hash,
  numberToHex,
  type PublicClient,
  type TransactionReceipt,
} from 'viem'
import { sepolia } from 'viem/chains'
import { waitForTransaction } from '../helpers/waitForTransaction'
import { transactionManager } from '../providers/transactionManager'
import type { EOASigner } from '../types/signer.types'
import type { TransactionIntent } from '../types/transaction.types'

export const TEST_CHAIN_ID = sepolia.id

export const TEST_TX_HASH = `0x${'ab'.repeat(32)}` as Hash
const TX_TARGET = '0x00000000000000000000000000000000000000ff' as Address

const RECEIPT = {
  status: 'success',
  transactionHash: TEST_TX_HASH,
} as TransactionReceipt

export type TestWallet = {
  readonly address: Address
  readonly signer: EOASigner
  /** How many times the wallet has been asked to send a transaction. */
  readonly walletRequests: () => number
  /** Blocks `eth_sendTransaction` until `release()` is called. */
  readonly hold: () => { release: () => void }
}

/**
 * A wallet whose transport records every RPC call, and which can be made to
 * hold a send open so a test can act while a transaction is in flight.
 */
export function createCountingWallet(address: Address): TestWallet {
  const methods: string[] = []
  let gate: Promise<void> | undefined

  // A connected wagmi wallet always carries the chain it is on, and the EOA
  // transport refuses to send without one. With a chain set, viem checks it
  // against a live `eth_chainId` before sending, so the wallet answers that too.
  const walletClient = createWalletClient({
    account: address,
    chain: sepolia,
    transport: custom({
      request: async ({ method }: { method: string }) => {
        methods.push(method)
        if (method === 'eth_chainId') return numberToHex(TEST_CHAIN_ID)
        if (method !== 'eth_sendTransaction')
          throw new Error(`Unexpected RPC call in test: ${method}`)
        if (gate) await gate
        return TEST_TX_HASH
      },
    } as unknown as EIP1193Provider),
  })

  return {
    address,
    signer: { type: 'eoa', walletClient },
    walletRequests: () =>
      methods.filter((method) => method === 'eth_sendTransaction').length,
    hold: () => {
      let release = () => {}
      gate = new Promise<void>((resolve) => {
        release = () => {
          gate = undefined
          resolve()
        }
      })
      return { release }
    },
  }
}

/** A public client that resolves receipts successfully and nothing else. */
export const testPublicClient = {
  waitForTransactionReceipt: async () => RECEIPT,
} as unknown as PublicClient

export const testIntent = (from: Address): TransactionIntent => ({
  type: 'custom',
  request: {
    type: 'eoa',
    from,
    to: TX_TARGET,
    data: '0x',
    value: 0n,
    chainId: TEST_CHAIN_ID,
  },
})

/** Starts a step under `id` without waiting for it. */
export function startStep(id: string, wallet: TestWallet): string {
  return transactionManager.startTransaction(
    testIntent(wallet.address),
    wallet.signer,
    { id, publicClient: testPublicClient, chainId: TEST_CHAIN_ID },
  )
}

/**
 * Runs one step under `id` and resolves once its actor reaches `success`,
 * leaving the finished actor in the manager exactly as the app does.
 */
export async function runStepToSuccess(
  id: string,
  wallet: TestWallet,
): Promise<string> {
  const txId = startStep(id, wallet)
  await waitForTransaction(txId)
  return txId
}

/** Puts the module-level singleton back to a known state between tests. */
export function resetTransactionManager(): void {
  transactionManager.clear()
  transactionManager.setConnectedAccount(undefined)
}
