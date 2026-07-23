import { getTokenAddress, RhinestoneSDK } from '@rhinestone/sdk'
import type { Address, Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { logger } from '#utils/logger.js'
import { type FulfilmentLeg, LEG_GAS_LIMITS } from './intent-quote.js'

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

/** The rail's USDC on this chain — the settlement anchor for USDC-gas routing. */
const USDC_L1 = getTokenAddress('USDC', sepolia.id)

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

  /**
   * Execute one INTENT carrying one or more calls. Batching calls into a
   * single intent is a first-order cost lever: the rail bills ~100k gas of
   * intent machinery (fill wrapper + claim) PER INTENT on top of our calls
   * (measured 2026-07-23: a 150k-limit quote bills as ~250k units at the
   * orchestrator's own gas price), so every merged call saves one machinery
   * unit. Calls execute in order and ATOMICALLY — the batch fully lands or
   * fully reverts, which is what makes deploy+commit fusion retry-safe (no
   * deploy-landed-but-commit-didn't partial states).
   */
  return async function execWriteViaIntents(
    calls: Array<{ to: Address; data: Hex; leg: FulfilmentLeg }>,
  ): Promise<Hex> {
    accountPromise ??= init()
    const { account, initSig } = await accountPromise

    const result = await account.sendTransaction({
      chain: sepolia,
      eip7702InitSignature: initSig,
      calls: calls.map((c) => ({ to: c.to, value: 0n, data: c.data })),
      // tokenRequests MUST be the nominal 1n anchor. MEASURED (quote probe
      // 2026-07-23): the request amount does NOT price into the quote — it is
      // RESERVED from the account's balance ON TOP of the fee. Declaring a
      // real amount therefore ~doubles the balance a leg needs and starves
      // gas ("insufficient available balance … leaving too little remainder
      // for gas"). Same-chain legs self-fund from the executor's own USDC;
      // the 1n merely anchors USDC as the settlement asset for routing.
      tokenRequests: [{ address: USDC_L1, amount: 1n }],
      feeAsset: 'USDC',
      sourceAssets: ['USDC'],
      // The rail prices the fee on the LIMIT (measured: same call quotes
      // 1.10 @150k vs 2.64 @500k). Per-leg limits — shared with the buyer's
      // fee quote via LEG_GAS_LIMITS — summed over the batch, keep the fee
      // as tight as the batch's real gas needs allow.
      gasLimit: calls.reduce((sum, c) => sum + LEG_GAS_LIMITS[c.leg], 0n),
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
