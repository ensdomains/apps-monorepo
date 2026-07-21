import { RhinestoneSDK } from '@rhinestone/sdk'
import { type Address, encodeFunctionData, type Hex, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { logger } from '#utils/logger.js'
import { CONTRACTS, PAYMENT_TOKENS } from './fulfilment.js'
import { getRolesConfig } from './roles.js'

/**
 * Order-time fulfilment fee, quoted by the Rhinestone orchestrator — the
 * SINGLE pricing source for what fulfilment will actually cost (solver fee +
 * gas, denominated in the payment stable). No Chainlink, no gasPrice math:
 * the same system that executes the intents prices them.
 *
 * The buyer pays this fee inside the voucher mint (`gasFee` split → the
 * executor account), so the executor's stables float replenishes per sale.
 *
 * Quoting uses REPRESENTATIVE calldata (a Roles-wrapped `commit`) at the
 * measured per-leg gas limits — the orchestrator's fee model is
 * `gasLimit × gasPrice + fixed overhead per intent`, so calldata-byte
 * variance against the real fulfilment payloads is buffer noise.
 */

/** Per-leg gas limits, from live Sepolia receipts through the Roles modifier:
 * resolver deploy 217,915 + commit 84,823 (one intent) and register 336,856
 * (second intent), each with headroom. */
const LEG_GAS_LIMITS = [350_000n, 400_000n] as const

/** Multiplier on the quoted fee: covers quote→execution drift (the buyer may
 * sit on the mint) and calldata variance vs the representative payload. */
const FEE_BUFFER_PERCENT = 15n

/**
 * Conservative fallback (USDC, 6dp) when the orchestrator can't quote
 * (down, unconfigured API key, executor float too thin to construct a
 * funded quote). Overquoting cents-to-dollars beats blocking checkout or
 * underquoting the executor's gas. Sized above the observed two-leg testnet
 * quote (~7.4 USDC).
 */
const FALLBACK_FEE_UNITS_6DP = 12_000_000n

const ROLES_ABI = parseAbi([
  'function execTransactionWithRole(address to, uint256 value, bytes data, uint8 operation, bytes32 roleKey, bool shouldRevert) returns (bool)',
])
const COMMIT_ABI = parseAbi(['function commit(bytes32 commitment)'])
const REPRESENTATIVE_COMMITMENT =
  '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex

/** Sum an intent route's spends into USDC 6dp units. Direct USDC spends sum
 * exactly; native/other spends convert through the orchestrator's own
 * `tokenPrices` (float precision is fine at fee scale — dollars). */
// biome-ignore lint/suspicious/noExplicitAny: orchestrator route shape, consumed defensively
function routeFeeInUsdc6(prepared: any, usdcAddress: Address): bigint {
  const intentOp = prepared?.intentRoute?.intentOp
  const elements: any[] = intentOp?.elements ?? []
  const prices = intentOp?.signedMetadata?.tokenPrices ?? {}
  let total = 0n
  for (const el of elements) {
    for (const [id, amt] of el?.spendTokens ?? []) {
      const token = `0x${(BigInt(id) & ((1n << 160n) - 1n))
        .toString(16)
        .padStart(40, '0')}`
      const amount = BigInt(amt)
      if (token.toLowerCase() === usdcAddress.toLowerCase()) {
        total += amount
      } else if (token === `0x${'0'.repeat(40)}`) {
        // Native spend → USD → USDC units via the quote's own prices.
        const ethUsd = Number(prices.ETH ?? 0)
        const usdcUsd = Number(prices.USDC ?? 1)
        if (ethUsd > 0) {
          const usd = (Number(amount) / 1e18) * ethUsd
          total += BigInt(Math.ceil((usd / usdcUsd) * 1e6))
        }
      }
    }
  }
  return total
}

/**
 * Quote the two-leg fulfilment fee in USDC units (6dp), buffered. Returns the
 * conservative fallback (with a warning log) whenever the orchestrator can't
 * produce a funded quote — checkout must not hard-depend on quote uptime.
 */
export async function quoteFulfilmentFee(
  env: CloudflareBindings,
): Promise<bigint> {
  const apiKey = env.RHINESTONE_API_KEY
  const privateKey = env.REGISTRAR_MEMBER_PRIVATE_KEY ?? env.ETH_PRIVATE_KEY
  if (!apiKey || !privateKey?.startsWith('0x')) {
    logger.warn('Fulfilment fee: orchestrator not configured, using fallback')
    return FALLBACK_FEE_UNITS_6DP
  }

  try {
    // Throws on partial config; direct-EOA mode (undefined) has no Roles
    // wrapper to quote against — fall back rather than fabricate a shape.
    const roles = getRolesConfig(env)
    if (!roles) {
      logger.warn('Fulfilment fee: direct-EOA mode, using fallback')
      return FALLBACK_FEE_UNITS_6DP
    }

    const eoa = privateKeyToAccount(privateKey as Hex)
    const rhinestone = new RhinestoneSDK({ apiKey })
    const account = await rhinestone.createAccount({
      owners: { type: 'ecdsa', accounts: [eoa] },
      eoa,
    })
    const initSig = await account.signEip7702InitData()

    const usdc = PAYMENT_TOKENS.USDC
    const data = encodeFunctionData({
      abi: ROLES_ABI,
      functionName: 'execTransactionWithRole',
      args: [
        CONTRACTS.ETHRegistrar,
        0n,
        encodeFunctionData({
          abi: COMMIT_ABI,
          functionName: 'commit',
          args: [REPRESENTATIVE_COMMITMENT],
        }),
        0,
        roles.roleKey,
        true,
      ],
    })

    let fee = 0n
    for (const gasLimit of LEG_GAS_LIMITS) {
      const prepared = await account.prepareTransaction({
        chain: sepolia,
        eip7702InitSignature: initSig,
        calls: [{ to: roles.module, value: 0n, data }],
        tokenRequests: [{ address: usdc, amount: 1n }],
        feeAsset: 'USDC',
        gasLimit,
      })
      fee += routeFeeInUsdc6(prepared, usdc)
    }

    if (fee === 0n) {
      logger.warn('Fulfilment fee: quote produced zero, using fallback')
      return FALLBACK_FEE_UNITS_6DP
    }

    return (fee * (100n + FEE_BUFFER_PERCENT)) / 100n
  } catch (error) {
    logger.warn('Fulfilment fee: orchestrator quote failed, using fallback', {
      error,
    })
    return FALLBACK_FEE_UNITS_6DP
  }
}
