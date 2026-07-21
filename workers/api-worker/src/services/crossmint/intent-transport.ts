import { RhinestoneSDK } from '@rhinestone/sdk'
import type { Address, Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { logger } from '#utils/logger.js'

/**
 * Intents execution transport (`FULFILMENT_TRANSPORT=intents`): fulfilment
 * writes go through Rhinestone Warp instead of raw executor-signed txs.
 *
 * The executor EOA acts as an EIP-7702 smart account — SAME ADDRESS, so the
 * on-chain Roles membership works identically for both transports (the
 * modifier sees `msg.sender == executor` either way; the delegation itself
 * rides the first intent's setup ops). Solvers front the destination gas and
 * are reimbursed from the executor's USDC — the very stables the voucher's
 * gasFee split lands there at mint. No ETH anywhere in the loop.
 *
 * `execWriteViaIntents` preserves the raw transport's contract: it resolves
 * to the DESTINATION FILL transaction hash, so callers that fetch receipts
 * and parse inner events (ProxyDeployed, NameRegistered — which bubble into
 * the fill receipt exactly as they bubble into a Roles outer tx) keep
 * working unchanged.
 */

/** Shared dev key, already committed in apps/manager/.env.ci. */
const DEFAULT_RHINESTONE_API_KEY =
  'rs_2fcz8PTz5A0vf1Z1HIG19qHxTd_NtCCJmRavTxtNL8'

/** Sepolia USDC — the executor float's asset (fee + funding pinned to it). */
const USDC_L1: Address = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

/**
 * Default destination gas limit. Covers the largest single leg (register,
 * 337k measured through the modifier) with margin; the orchestrator prices
 * fees on the limit, so callers with cheaper legs may pass a tighter one.
 */
const DEFAULT_GAS_LIMIT = 500_000n

export function isIntentsTransport(env: CloudflareBindings): boolean {
  return env.FULFILMENT_TRANSPORT === 'intents'
}

/**
 * Build the intents-backed write executor. The 7702 account + init signature
 * are created lazily once per executor instance (one queue job = one
 * instance), then each call is a single-chain Sepolia intent.
 */
export function createIntentExecutor(env: CloudflareBindings) {
  const privateKey = env.REGISTRAR_MEMBER_PRIVATE_KEY ?? env.ETH_PRIVATE_KEY
  if (!privateKey?.startsWith('0x')) {
    throw new Error('Intents transport requires the executor private key')
  }
  const apiKey = env.RHINESTONE_API_KEY ?? DEFAULT_RHINESTONE_API_KEY

  let accountPromise: ReturnType<typeof init> | null = null
  const init = async () => {
    const eoa = privateKeyToAccount(privateKey as Hex)
    const rhinestone = new RhinestoneSDK({ apiKey })
    const account = await rhinestone.createAccount({
      owners: { type: 'ecdsa', accounts: [eoa] },
      eoa,
    })
    const initSig = await account.signEip7702InitData()
    return { account, initSig }
  }

  return async function execWriteViaIntents(
    call: { to: Address; data: Hex },
    gasLimit: bigint = DEFAULT_GAS_LIMIT,
  ): Promise<Hex> {
    accountPromise ??= init()
    const { account, initSig } = await accountPromise

    const result = await account.sendTransaction({
      chain: sepolia,
      eip7702InitSignature: initSig,
      calls: [{ to: call.to, value: 0n, data: call.data }],
      // The intent moves no tokens itself (the Safe pays at the targets);
      // the 1-unit request just anchors the fee/funding asset to USDC.
      tokenRequests: [{ address: USDC_L1, amount: 1n }],
      sourceAssets: ['USDC'],
      feeAsset: 'USDC',
      gasLimit,
    })

    const status = await account.waitForExecution(result)
    const fillHash = (status as { fill?: { hash?: Hex } })?.fill?.hash
    if (!fillHash) {
      logger.error('Intent completed without a fill hash', { status })
      throw new Error('Intent executed without a destination fill hash')
    }
    return fillHash
  }
}
