/**
 * makeGraceV1Name — seeds a V1 .eth 2LD that is inside its 90-day grace
 * period on BOTH clocks the migration flow reads, while moving the shared
 * fork's clock by only a couple of minutes.
 *
 * Why not `makeV1Name({ duration: -N })`:
 *   - the V1 controller enforces a 28-day minimum registration, so that path
 *     pushes the shared anvil clock 28+ days ahead of wall time on every call,
 *     which breaks HCA signing for every other spec sharing the fork;
 *   - the app classifies grace names against the wall clock (`Date.now()`),
 *     so on a fork that is behind wall time a 28-day name still reads as
 *     active and never reaches the grace list;
 *   - it reserves the V2 slot at exactly `v1Expiry`. Real pre-migration
 *     reserves at `v1Expiry + PREMIGRATION_BONUS_PERIOD`, so the slot stays
 *     RESERVED for the whole V1 grace period.
 *
 * Instead this registers directly on the BaseRegistrar as an authorised
 * controller with a ~90s duration, reserves in V2 with the real bonus, wraps
 * if asked, then advances the chain just past expiry.
 *
 * The app reads `Date.now()`, and anvil mines at wall time plus every
 * `increaseTime` offset ever applied, so the caller must install the browser
 * clock at the chain's time (`syncBrowserToChain`) before loading the app.
 */
import {
  type Address,
  encodeFunctionData,
  keccak256,
  parseAbi,
  toHex,
  zeroAddress,
} from 'viem'
import type { PrivateKeyAccount } from 'viem/accounts'
import {
  publicClient,
  testClient,
  walletClient,
} from '../helpers/anvil-client.js'
import {
  reserveInV2,
  V1_BASE_REGISTRAR,
  V1_NAME_WRAPPER,
} from './makeV1Name.js'
import {
  APP_V1_CONTROLLER,
  ensureV1ControllersAuthorised,
} from './v1-controller-auth.js'

const DAY = 24n * 60n * 60n
/** `1 + (GRACE_PERIOD_V1 - GRACE_PERIOD_V2)` from contracts-v2 deploy constants. */
export const PREMIGRATION_BONUS_PERIOD = 1n + (90n - 28n) * DAY
const SEED_DURATION = 90n
const CANNOT_UNWRAP = 1

const BASE_REGISTRAR_ABI = parseAbi([
  'function register(uint256 id, address owner, uint256 duration) returns (uint256)',
  'function nameExpires(uint256 id) view returns (uint256)',
  'function setApprovalForAll(address operator, bool approved)',
])
const NAME_WRAPPER_ABI = parseAbi([
  'function wrapETH2LD(string label, address wrappedOwner, uint16 ownerControlledFuses, address resolver) returns (uint64)',
])

export type GraceV1Name = {
  readonly name: string
  readonly label: string
  readonly tokenId: bigint
  /** Registrar expiry (seconds), already in the past on chain and wall clock. */
  readonly expiry: bigint
}

const send = async (
  account: PrivateKeyAccount | Address,
  to: Address,
  data: `0x${string}`,
) => {
  const hash = await walletClient.sendTransaction({ account, to, data })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    throw new Error(`[makeGraceV1Name] tx ${hash} reverted`)
  }
}

export async function makeGraceV1Name(config: {
  readonly label: string
  readonly owner: PrivateKeyAccount
  readonly wrapped?: boolean
  /** Wrap with CANNOT_UNWRAP burned (implies `wrapped`). */
  readonly locked?: boolean
  /** Resolver set when wrapping (default: none). */
  readonly resolver?: Address
}): Promise<GraceV1Name> {
  const wrapped = config.wrapped || config.locked
  const label = `${config.label}-${Date.now().toString(36)}`
  const tokenId = BigInt(keccak256(toHex(label)))

  await ensureV1ControllersAuthorised()

  // ── 1. Register as the (authorised) controller — no 28-day minimum ──
  await testClient.impersonateAccount({ address: APP_V1_CONTROLLER })
  await testClient.setBalance({
    address: APP_V1_CONTROLLER,
    value: 10n ** 19n,
  })
  try {
    await send(
      APP_V1_CONTROLLER,
      V1_BASE_REGISTRAR,
      encodeFunctionData({
        abi: BASE_REGISTRAR_ABI,
        functionName: 'register',
        args: [tokenId, config.owner.address, SEED_DURATION],
      }),
    )
  } finally {
    await testClient.stopImpersonatingAccount({ address: APP_V1_CONTROLLER })
  }

  const expiry = await publicClient.readContract({
    address: V1_BASE_REGISTRAR,
    abi: BASE_REGISTRAR_ABI,
    functionName: 'nameExpires',
    args: [tokenId],
  })

  // ── 2. Reserve in V2 the way pre-migration does (with the bonus) ──
  await reserveInV2(label, expiry + PREMIGRATION_BONUS_PERIOD)

  // ── 3. Wrap while still active ──
  if (wrapped) {
    await send(
      config.owner,
      V1_BASE_REGISTRAR,
      encodeFunctionData({
        abi: BASE_REGISTRAR_ABI,
        functionName: 'setApprovalForAll',
        args: [V1_NAME_WRAPPER, true],
      }),
    )
    await send(
      config.owner,
      V1_NAME_WRAPPER,
      encodeFunctionData({
        abi: NAME_WRAPPER_ABI,
        functionName: 'wrapETH2LD',
        args: [
          label,
          config.owner.address,
          config.locked ? CANNOT_UNWRAP : 0,
          config.resolver ?? zeroAddress,
        ],
      }),
    )
  }

  // ── 4. Step just past expiry ──
  const { timestamp } = await publicClient.getBlock({ blockTag: 'latest' })
  if (timestamp <= expiry) {
    await testClient.increaseTime({ seconds: Number(expiry - timestamp) + 1 })
    await testClient.mine({ blocks: 1 })
  }

  console.log(
    `[makeGraceV1Name] ✅ ${label}.eth in grace (expiry=${expiry}, wrapped=${!!wrapped}, locked=${!!config.locked})`,
  )
  return { name: `${label}.eth`, label, tokenId, expiry }
}

/**
 * Install the browser clock at the chain's current time, ticking normally.
 * Call before the first navigation so every `Date.now()` the app reads agrees
 * with `block.timestamp`.
 */
export async function syncBrowserToChain(
  page: import('@playwright/test').Page,
): Promise<void> {
  const { timestamp } = await publicClient.getBlock({ blockTag: 'latest' })
  await page.clock.install({ time: new Date(Number(timestamp) * 1000) })
}
