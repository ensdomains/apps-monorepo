/**
 * makeName fixture — programmatically registers .eth names on the
 * Anvil Sepolia fork via the V2 FastTestETHRegistrar contract.
 *
 * Supports negative `duration` to create expired / grace-period /
 * temporary-premium names by registering with a padded duration and
 * then fast-forwarding anvil time past expiry.
 *
 * Registration flow:
 *   1. Mint USDC to the owner account
 *   2. makeCommitment → commit
 *   3. Wait for MIN_COMMITMENT_AGE (may be 0 on FastTestETHRegistrar)
 *   4. rentPrice → approve USDC → register
 *   5. (If negative duration) increaseTime to push past expiry
 */
import {
  type Address,
  type Hash,
  encodeFunctionData,
  keccak256,
  parseAbi,
  toHex,
  zeroAddress,
  zeroHash,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import {
  publicClient,
  testClient,
  walletClient,
} from '../helpers/anvil-client.js'
import type { Time } from './time.js'

// ---------------------------------------------------------------------------
// Contract addresses (same as packages/transaction-manager/src/contracts/ens-sepolia.ts)
// ---------------------------------------------------------------------------
const FAST_TEST_ETH_REGISTRAR =
  '0xe37a1366c827d18dc0ad57f3767de4b3025ceac2' as const
const MOCK_USDC = '0x2c3d8dfac22def2947e94432bcd6bb51e1ac55e6' as const
const DEDICATED_RESOLVER =
  '0xa20b41dc7336c4d974e3c9a6ea01b77647559c46' as const
const REFERRER = zeroHash

// ---------------------------------------------------------------------------
// ABIs (minimal, only the functions we call)
// ---------------------------------------------------------------------------
const REGISTRAR_ABI = parseAbi([
  'function makeCommitment(string name, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)',
  'function commit(bytes32 commitment)',
  'function register(string name, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256 tokenId)',
  'function rentPrice(string name, address owner, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)',
  'function MIN_COMMITMENT_AGE() view returns (uint64)',
  'function commitmentAt(bytes32 commitment) view returns (uint64)',
  'function isAvailable(string name) view returns (bool)',
])

// Registry ABI — to read the name's expiry after registration
const REGISTRY_ABI = parseAbi([
  'function getNameData(string name) view returns (uint256 tokenId, uint64 expiry, uint96 flags, address subregistry)',
])

// ETHRegistry address (from ens-sepolia.ts)
const ETH_REGISTRY = '0xF332544e6234f1CA149907D0d4658afD5feB6831' as const

const ERC20_ABI = parseAbi([
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
])

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Minimum registration duration the contract will accept (28 days). */
const MIN_REGISTRATION_DURATION = 28 * 24 * 60 * 60

// Anvil's first default account (has 10 000 ETH, used for minting ERC20s)
const ANVIL_FUNDER = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type NameConfig = {
  /** The label (without `.eth`). A timestamp suffix is appended for uniqueness. */
  label: string
  /**
   * Duration in seconds.
   *  - Positive: name will expire this many seconds from now.
   *  - Negative: name will have expired |duration| seconds ago
   *    (e.g. -86400 = expired 1 day ago → grace period;
   *     -7890000 = ~3 months ago → temporary premium window).
   */
  duration?: number
}

type Dependencies = {
  accounts: {
    getAddress: (user?: any) => Address
    getPrivateKey: (user?: any) => Hash
  }
  time: Time
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function waitForTx(hash: Hash) {
  return publicClient.waitForTransactionReceipt({ hash })
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createMakeName({ accounts, time }: Dependencies) {
  /**
   * Register a name on the anvil fork and return the full `.eth` name.
   *
   * If `duration` is negative the name is registered then anvil time is
   * advanced so the name appears expired by |duration| seconds.
   */
  return async function makeName(
    config: NameConfig,
    options: { timeOffset?: number } = {},
  ): Promise<string> {
    const ownerAddress = accounts.getAddress('user')
    const ownerAccount = privateKeyToAccount(accounts.getPrivateKey('user'))
    const timestamp = Math.floor(Date.now() / 1000)
    const uniqueLabel = `${config.label}-${timestamp}`

    // Determine actual on-chain duration and the desired gap past expiry
    const requestedDuration = config.duration ?? MIN_REGISTRATION_DURATION
    let registrationDuration: number
    /** Seconds past expiry the name should be (0 = not expired). */
    let desiredGapPastExpiry = 0

    if (requestedDuration < 0) {
      // Register with minimum duration, then set block time to expiry + |duration|
      registrationDuration = MIN_REGISTRATION_DURATION
      desiredGapPastExpiry = Math.abs(requestedDuration)
    } else {
      registrationDuration = Math.max(requestedDuration, MIN_REGISTRATION_DURATION)
    }

    const secret = keccak256(toHex(`${uniqueLabel}:${Math.random()}`))

    console.log(
      `[makeName] registering ${uniqueLabel}.eth (duration=${registrationDuration}s, desiredGapPastExpiry=${desiredGapPastExpiry}s)`,
    )

    // ── 0. Clear any contract code at owner address ───────────────
    // Well-known Anvil accounts (e.g. 0xf39F…2266) have EOF contracts
    // deployed on Sepolia, which breaks ERC1155 _safeMint. Setting the
    // code to 0x makes the address an EOA on the fork.
    await testClient.setCode({ address: ownerAddress, bytecode: '0x' })

    // ── 1. Mint USDC to the owner ─────────────────────────────────
    // We mint a generous amount so approval + registration always succeeds.
    const mintData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'mint',
      args: [ownerAddress, BigInt(10_000_000_000)], // 10 000 USDC (6 decimals)
    })
    const mintTx = await walletClient.sendTransaction({
      account: ANVIL_FUNDER,
      to: MOCK_USDC,
      data: mintData,
    })
    await waitForTx(mintTx)

    // ── 2. Make commitment ────────────────────────────────────────
    const commitment = await publicClient.readContract({
      address: FAST_TEST_ETH_REGISTRAR,
      abi: REGISTRAR_ABI,
      functionName: 'makeCommitment',
      args: [
        uniqueLabel,
        ownerAddress,
        secret,
        zeroAddress,
        DEDICATED_RESOLVER,
        BigInt(registrationDuration),
        REFERRER,
      ],
    })

    // ── 3. Submit commitment ──────────────────────────────────────
    const commitData = encodeFunctionData({
      abi: REGISTRAR_ABI,
      functionName: 'commit',
      args: [commitment],
    })
    const commitTx = await walletClient.sendTransaction({
      account: ownerAccount,
      to: FAST_TEST_ETH_REGISTRAR,
      data: commitData,
    })
    await waitForTx(commitTx)

    // ── 4. Wait for MIN_COMMITMENT_AGE ────────────────────────────
    let minAge = 0n
    try {
      minAge = await publicClient.readContract({
        address: FAST_TEST_ETH_REGISTRAR,
        abi: REGISTRAR_ABI,
        functionName: 'MIN_COMMITMENT_AGE',
      })
    } catch {
      // Default to 0 if not available
    }

    if (minAge > 0n) {
      const waitSec = Number(minAge) + 1
      console.log(`[makeName] waiting ${waitSec}s for MIN_COMMITMENT_AGE`)
      await testClient.increaseTime({ seconds: waitSec })
      await testClient.mine({ blocks: 1 })
    }

    // ── 5. Get rent price ─────────────────────────────────────────
    const [base, premium] = await publicClient.readContract({
      address: FAST_TEST_ETH_REGISTRAR,
      abi: REGISTRAR_ABI,
      functionName: 'rentPrice',
      args: [
        uniqueLabel,
        ownerAddress,
        BigInt(registrationDuration),
        MOCK_USDC,
      ],
    })
    const totalPrice = base + premium

    // ── 6. Approve USDC spend ─────────────────────────────────────
    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [FAST_TEST_ETH_REGISTRAR, totalPrice * 2n],
    })
    const approveTx = await walletClient.sendTransaction({
      account: ownerAccount,
      to: MOCK_USDC,
      data: approveData,
    })
    await waitForTx(approveTx)

    // ── 7. Register ───────────────────────────────────────────────
    const registerData = encodeFunctionData({
      abi: REGISTRAR_ABI,
      functionName: 'register',
      args: [
        uniqueLabel,
        ownerAddress,
        secret,
        zeroAddress,
        DEDICATED_RESOLVER,
        BigInt(registrationDuration),
        MOCK_USDC,
        REFERRER,
      ],
    })
    const registerTx = await walletClient.sendTransaction({
      account: ownerAccount,
      to: FAST_TEST_ETH_REGISTRAR,
      data: registerData,
    })
    await waitForTx(registerTx)

    console.log(`[makeName] ✅ registered ${uniqueLabel}.eth`)

    // ── 8. Fast-forward to exact target timestamp if needed ───────
    // We read the on-chain expiry and set block.timestamp to exactly
    // expiry + desiredGapPastExpiry. This avoids accumulated drift from
    // previous test runs on the same anvil fork.
    if (desiredGapPastExpiry > 0) {
      const [, expiry] = await publicClient.readContract({
        address: ETH_REGISTRY,
        abi: REGISTRY_ABI,
        functionName: 'getNameData',
        args: [uniqueLabel],
      })
      const targetTimestamp = Number(expiry) + desiredGapPastExpiry
      console.log(
        `[makeName] name expiry=${expiry}, target block.timestamp=${targetTimestamp} (${desiredGapPastExpiry}s past expiry)`,
      )
      await testClient.setNextBlockTimestamp({
        timestamp: BigInt(targetTimestamp),
      })
      await testClient.mine({ blocks: 1 })
    }

    // Sync browser clock with optional offset
    const timeOffset = options.timeOffset ?? 0
    await time.sync(timeOffset)

    const ethName = `${uniqueLabel}.eth`
    console.log(`[makeName] ready: ${ethName}`)
    return ethName
  }
}
