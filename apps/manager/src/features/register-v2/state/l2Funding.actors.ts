import {
  type L2BridgeQuote,
  type L2BridgeRoute,
  PERMIT2_ADDRESS,
  quoteL2Bridge,
  submitL2Bridge,
} from '@ens-apps/smart-account'
import { walletClientToAccount } from '@rhinestone/sdk'
import { getConnectorClient } from '@wagmi/core'
import { type Address, erc20Abi, maxUint256 } from 'viem'
import { fromPromise } from 'xstate'
import {
  buildIntentStatusFetcher,
  createBridgeAccount,
} from '@/lib/smart-account/rhinestone'
import { HCA_PAYMENT_TOKEN } from '@/lib/smart-account/useSmartAccountBalances'
import { l2PublicClients, publicClient, wagmiConfig } from '@/lib/wagmi'
import { ensureWalletChain } from '@/lib/wallet/ensureWalletChain'
import { followChain } from '@/lib/wallet/followChain'
import {
  type L2FundingRecord,
  writeL2FundingRecord,
} from '../service/l2FundingPersistence'
import type { L2FundingArrival } from './l2Funding.machine'

const POLL_INTERVAL_MS = 3_000
const STALL_AFTER_MS = 15 * 60_000
// Once Rhinestone reports the fill, how long to wait for the balance to show.
const BALANCE_GRACE_MS = 30_000

const sourceClient = (route: L2BridgeRoute) => {
  const client = l2PublicClients.get(route.sourceChain.id)
  if (!client) throw new Error(`No client for chain ${route.sourceChain.id}`)
  return client
}

// Fresh per step, so a wallet that changed since the quote is caught by wagmi.
const sourceWalletClient = async (route: L2BridgeRoute) =>
  followChain(
    await getConnectorClient(wagmiConfig, {
      account: route.owner,
      assertChainId: false,
      chainId: route.sourceChain.id,
    }),
    route.sourceChain,
    (chainId) => ensureWalletChain(wagmiConfig, chainId),
  )

const signingBridgeAccount = async (route: L2BridgeRoute) =>
  createBridgeAccount({
    eoa: walletClientToAccount(await sourceWalletClient(route)),
    route,
  }).match(
    (account) => account,
    (error) => {
      throw error
    },
  )

const readWalletBalance = (owner: Address) =>
  publicClient.readContract({
    address: HCA_PAYMENT_TOKEN,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  })

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })

export const l2FundingActors = {
  readAllowance: fromPromise<bigint, { route: L2BridgeRoute }>(({ input }) =>
    sourceClient(input.route).readContract({
      address: input.route.sourceToken,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [input.route.owner, PERMIT2_ADDRESS],
    }),
  ),

  // Unlimited, once per L2: Permit2 only moves tokens against a signed permit.
  approvePermit2: fromPromise<void, { route: L2BridgeRoute }>(
    async ({ input: { route } }) => {
      const wallet = await sourceWalletClient(route)
      const hash = await wallet.writeContract({
        address: route.sourceToken,
        abi: erc20Abi,
        functionName: 'approve',
        args: [PERMIT2_ADDRESS, maxUint256],
      })
      const receipt = await sourceClient(route).waitForTransactionReceipt({
        hash,
      })
      if (receipt.status !== 'success') {
        throw new Error('The Permit2 approval reverted.')
      }
    },
  ),

  requote: fromPromise<L2BridgeQuote, { route: L2BridgeRoute }>(
    async ({ input: { route } }) =>
      quoteL2Bridge(await signingBridgeAccount(route), route).match(
        (quote) => quote,
        (error) => {
          throw error
        },
      ),
  ),

  // Records the bridge before resolving, so it is tracked even if the flow
  // was closed while the wallet prompt was open.
  submit: fromPromise<L2FundingRecord, { quote: L2BridgeQuote }>(
    async ({ input: { quote } }) => {
      const { route } = quote
      const balanceBefore = await readWalletBalance(route.owner)
      const account = await signingBridgeAccount(route)
      const intentId = await submitL2Bridge(account, quote).match(
        (id) => id,
        (error) => {
          throw error
        },
      )
      const record: L2FundingRecord = {
        owner: route.owner,
        sourceChainId: route.sourceChain.id,
        amountOut: route.amountOut,
        amountIn: quote.amountIn,
        intentId,
        balanceBefore,
        submittedAt: Date.now(),
      }
      writeL2FundingRecord(record)
      return record
    },
  ),

  awaitArrival: fromPromise<L2FundingArrival, { record: L2FundingRecord }>(
    async ({ input: { record }, signal }) => {
      const fetchStatus = buildIntentStatusFetcher()
      const target = record.balanceBefore + record.amountOut
      const stallAt = Date.now() + STALL_AFTER_MS
      let filledAt: number | undefined
      while (Date.now() < stallAt) {
        const [status, balance] = await Promise.all([
          fetchStatus?.(record.intentId, signal) ?? null,
          readWalletBalance(record.owner).catch(() => null),
        ])
        if (balance !== null && balance >= target) return { outcome: 'arrived' }
        if (status === 'FAILED' || status === 'EXPIRED') {
          return { outcome: 'failed' }
        }
        if (status === 'FILLED' || status === 'COMPLETED') {
          filledAt ??= Date.now()
          if (Date.now() - filledAt >= BALANCE_GRACE_MS) {
            return { outcome: 'arrived' }
          }
        }
        await sleep(POLL_INTERVAL_MS, signal)
      }
      return { outcome: 'stalled' }
    },
  ),
}
