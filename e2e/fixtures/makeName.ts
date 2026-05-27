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
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  http,
  keccak256,
  parseAbi,
  stringToBytes,
  toHex,
  zeroAddress,
  zeroHash,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import {
  ethRegistrarAvailableSnippet,
  ethRegistrarCommitSnippet,
  ethRegistrarCommitmentsSnippet,
  ethRegistrarMakeCommitmentSnippet,
  ethRegistrarRegisterSnippet,
  ethRegistrarRentPriceSnippet,
  permissionedRegistryGetExpirySnippet,
  proxyDeployedEventSnippet,
  subregistryInitializeSnippet,
  verifiableFactoryDeployProxySnippet,
} from '@ensdomains/ensjs-abi/v2'
import { setRecords } from '@ensdomains/ensjs/wallet'
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'

import {
  publicClient,
  testClient,
  walletClient,
} from '../helpers/anvil-client.js'
import type { Time } from './time.js'

// ---------------------------------------------------------------------------
// Contract addresses (sourced from ensjs Sepolia chain config)
// ---------------------------------------------------------------------------
const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]
const FAST_TEST_ETH_REGISTRAR = ensjsSepolia.ensEthRegistrar.address
const MOCK_USDC = ensjsSepolia.usdc.address
// Shared dedicated resolver for names that don't need custom records
const DEDICATED_RESOLVER = '0x640294a2b2d87e7f522db3e3e3e876764bce170d' as const
const PERMISSIONED_RESOLVER_IMPL = ensjsSepolia.ensPermissionedResolverImpl.address
const VERIFIABLE_FACTORY = ensjsSepolia.ensVerifiableFactory.address
const ETH_REGISTRY = ensjsSepolia.ensRegistry.address
const REFERRER = zeroHash

// ---------------------------------------------------------------------------
// ABIs
// ---------------------------------------------------------------------------
// MIN_COMMITMENT_AGE is not yet exported by ensjs-abi; all other functions
// are sourced from ethRegistrar snippets.
const REGISTRAR_ABI = [
  ...ethRegistrarMakeCommitmentSnippet,
  ...ethRegistrarCommitSnippet,
  ...ethRegistrarRegisterSnippet,
  ...ethRegistrarRentPriceSnippet,
  ...ethRegistrarCommitmentsSnippet,
  ...ethRegistrarAvailableSnippet,
  ...parseAbi(['function MIN_COMMITMENT_AGE() view returns (uint64)']),
] as const

const ERC20_ABI = parseAbi([
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
])

const FULL_ROLE_BITMAP = BigInt(
  '0x1111111111111111111111111111111111111111111111111111111111111111',
)

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
  /**
   * Optional text records to set on the resolver after registration.
   * When provided, a dedicated PermissionedResolver proxy is deployed
   * (instead of using the shared DEDICATED_RESOLVER) so the owner
   * has permission to call setText.
   */
  records?: { key: string; value: string }[]
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
    // Register with 'user2' so the connected wallet ('user') is NOT the
    // previous owner. The StandardRentPriceOracle exempts the previous
    // owner from the temporary premium.
    const ownerAddress = accounts.getAddress('user2')
    const ownerAccount = privateKeyToAccount(accounts.getPrivateKey('user2'))
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
    const records = config.records ?? []
    const hasRecords = records.length > 0

    console.log(
      `[makeName] registering ${uniqueLabel}.eth (duration=${registrationDuration}s, desiredGapPastExpiry=${desiredGapPastExpiry}s${hasRecords ? `, records=${records.length}` : ''})`,
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

    // ── 1a. Deploy dedicated resolver proxy if records are needed ───
    let resolverAddress: Address = DEDICATED_RESOLVER
    if (hasRecords) {
      resolverAddress = await deployResolverProxy(uniqueLabel, ownerAddress)
      console.log(`[makeName] resolver proxy: ${resolverAddress}`)
    }

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
        resolverAddress,
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

    // ── 7. Register ───────────────────────────────────────────
    const registerData = encodeFunctionData({
      abi: REGISTRAR_ABI,
      functionName: 'register',
      args: [
        uniqueLabel,
        ownerAddress,
        secret,
        zeroAddress,
        resolverAddress,
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

    const ethName = `${uniqueLabel}.eth`

    // ── 7a. Set text records via PermissionedResolver multicall ──
    if (hasRecords) {
      const ownerClient = createWalletClient({
        account: ownerAccount,
        chain: walletClient.chain!,
        transport: http(process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'),
      })
      await waitForTx(
        await setRecords(ownerClient, {
          name: ethName,
          resolverAddress,
          texts: records,
        }),
      )
      console.log(`[makeName] set ${records.length} record(s) on ${ethName}`)
    }

    console.log(`[makeName] ✅ registered ${ethName}`)

    // ── 8. Fast-forward to exact target timestamp if needed ───────
    // We read the on-chain expiry and set block.timestamp to exactly
    // expiry + desiredGapPastExpiry. This avoids accumulated drift from
    // previous test runs on the same anvil fork.
    if (desiredGapPastExpiry > 0) {
      const labelHash = BigInt(keccak256(toHex(uniqueLabel)))
      const expiry = await publicClient.readContract({
        address: ETH_REGISTRY,
        abi: permissionedRegistryGetExpirySnippet,
        functionName: 'getExpiry',
        args: [labelHash],
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

    console.log(`[makeName] ready: ${ethName}`)
    return ethName
  }
}

// ---------------------------------------------------------------------------
// Resolver deployment helper
// ---------------------------------------------------------------------------
async function deployResolverProxy(
  nameLabel: string,
  owner: Address,
): Promise<Address> {
  const salt = BigInt(
    keccak256(stringToBytes(`${nameLabel}:${new Date().toISOString()}`)),
  )
  const initCalldata = encodeFunctionData({
    abi: subregistryInitializeSnippet,
    functionName: 'initialize',
    args: [owner, FULL_ROLE_BITMAP],
  })
  const deployData = encodeFunctionData({
    abi: verifiableFactoryDeployProxySnippet,
    functionName: 'deployProxy',
    args: [PERMISSIONED_RESOLVER_IMPL, salt, initCalldata],
  })
  const deployTx = await walletClient.sendTransaction({
    account: ANVIL_FUNDER,
    to: VERIFIABLE_FACTORY,
    data: deployData,
  })
  const receipt = await waitForTx(deployTx)

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: proxyDeployedEventSnippet,
        data: log.data,
        topics: log.topics,
      })
      if (decoded.eventName === 'ProxyDeployed') {
        return (decoded.args as { proxyAddress: Address }).proxyAddress
      }
    } catch {
      // Ignore non-matching logs
    }
  }

  throw new Error(
    `[makeName] ProxyDeployed event not found in resolver deployment receipt`,
  )
}
