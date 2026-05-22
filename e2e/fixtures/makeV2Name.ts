/**
 * makeV2Name fixture — registers .eth names on the Anvil Sepolia fork
 * directly via the V2 FastTestETHRegistrar, owned by the Para test
 * account's EOA.
 *
 * Unlike `makeName` (which registers to `user2` for portal tests),
 * this fixture registers to the **Para EOA** so the manager app's
 * profile / primary-name UIs can manage them (the app uses HCA to
 * resolve smart-account → EOA ownership).
 *
 * Each name gets its own dedicated resolver proxy (deployed via
 * VerifiableFactory) initialized with the EOA as owner — matching
 * the app's registration flow.
 *
 * Registration flow:
 *   1. Deploy resolver proxy (VerifiableFactory.deployProxy)
 *   2. Fund the Para EOA with ETH + USDC
 *   3. makeCommitment → commit (signed by EOA)
 *   4. rentPrice → approve USDC → register (signed by EOA)
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import {
  proxyInitializeSnippet,
  verifiableFactoryDeployProxySnippet,
} from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import {
  type Address,
  type Hash,
  decodeEventLog,
  encodeFunctionData,
  keccak256,
  namehash,
  parseAbi,
  stringToBytes,
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

// ---------------------------------------------------------------------------
// Contract addresses (sourced from ensjs)
// ---------------------------------------------------------------------------
const sepoliaContracts = ensL1Contracts[supportedL1Chains.sepolia]

/**
 * FastTestETHRegistrar (MIN_COMMITMENT_AGE=0). This is a fork-local helper
 * contract not present in the canonical Sepolia deployment, so it stays
 * hard-coded.
 */
const FAST_TEST_ETH_REGISTRAR =
  '0xbbf892aea9bb883b36bab2adc7831a6c63ef1e39' as const

/** Mock USDC on the Sepolia fork (6 decimals) */
const MOCK_USDC: Address = sepoliaContracts.usdc.address

/** PermissionedResolver implementation — proxies are deployed per name */
const PERMISSIONED_RESOLVER_IMPL: Address =
  sepoliaContracts.ensPermissionedResolverImpl.address

/** VerifiableFactory for deploying resolver proxies */
const VERIFIABLE_FACTORY: Address = sepoliaContracts.ensVerifiableFactory.address

const REFERRER = zeroHash

// ---------------------------------------------------------------------------
// ABIs
// ---------------------------------------------------------------------------

const REGISTRAR_ABI = parseAbi([
  'function makeCommitment(string name, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)',
  'function commit(bytes32 commitment)',
  'function register(string name, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256 tokenId)',
  'function rentPrice(string name, address owner, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)',
  'function MIN_COMMITMENT_AGE() view returns (uint64)',
])

const ERC20_ABI = parseAbi([
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
])

const VERIFIABLE_FACTORY_ABI = verifiableFactoryDeployProxySnippet
const RESOLVER_INIT_ABI = proxyInitializeSnippet

const RESOLVER_ABI = parseAbi([
  'function setText(bytes32 node, string key, string value)',
])

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum registration duration the contract accepts (28 days). */
const MIN_REGISTRATION_DURATION = 28 * 24 * 60 * 60

/** Full role bitmap — grants all permissions on the resolver. */
const FULL_ROLE_BITMAP = BigInt(
  '0x1111111111111111111111111111111111111111111111111111111111111111',
)

/** Anvil's first default account (has 10 000 ETH — used for minting & funding). */
const ANVIL_FUNDER = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
)

/**
 * Para test account EOA — the app's registration machine uses
 * `ownerAddress` (the EOA) as the name owner and resolver owner.
 * The smart account calls contracts via HCA, and the resolver
 * resolves msg.sender → EOA via `getAccountOwner()`.
 */
const PARA_EOA_KEY =
  (process.env.ANVIL_PARA_PRIVATE_KEY ??
    '0x4d1cf5e322e2a7dbfc9e3eccde100ed93167879de7449d18872911ed3a957a81') as `0x${string}`
const PARA_EOA = privateKeyToAccount(PARA_EOA_KEY)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type V2NameConfig = {
  /** The label (without `.eth`). A timestamp suffix is appended for uniqueness. */
  label: string
  /** Duration in seconds (default: 28 days minimum). */
  duration?: number
  /** Optional text records to set on the resolver after registration. */
  records?: { key: string; value: string }[]
  /**
   * Who should own the name:
   * - `'user'` (default): the Para test EOA (authenticated user)
   * - `'other'`: Anvil's first account (not the authenticated user)
   */
  owner?: 'user' | 'other'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForTx(hash: Hash) {
  return publicClient.waitForTransactionReceipt({ hash })
}

function generateResolverSalt(name: string): bigint {
  const timestamp = new Date().toISOString()
  return BigInt(keccak256(stringToBytes(`${name}:${timestamp}`)))
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMakeV2Name() {
  /**
   * Register a V2 .eth name on the anvil fork, owned by the Para EOA,
   * with a dedicated resolver proxy.
   */
  return async function makeV2Name(
    config: V2NameConfig,
  ): Promise<string> {
    const isOther = config.owner === 'other'
    const ownerAddress = isOther ? ANVIL_FUNDER.address : PARA_EOA.address
    const ownerAccount = isOther ? ANVIL_FUNDER : PARA_EOA
    const timestamp = Math.floor(Date.now() / 1000)
    const uniqueLabel = `${config.label}-${timestamp}`
    const registrationDuration = Math.max(
      config.duration ?? MIN_REGISTRATION_DURATION,
      MIN_REGISTRATION_DURATION,
    )
    const secret = keccak256(toHex(`v2-${uniqueLabel}:${Math.random()}`))

    console.log(
      `[makeV2Name] registering ${uniqueLabel}.eth → ${ownerAddress} (EOA)`,
    )

    // ── 1. Deploy dedicated resolver proxy ──────────────────────────
    // Initialized with the EOA as owner — matches the app's flow where
    // the resolver checks HCA ownership (smart account → EOA).
    const resolverAddress = await deployResolverProxy(
      uniqueLabel,
      ownerAddress,
    )
    console.log(`[makeV2Name] resolver proxy: ${resolverAddress}`)

    // ── 2. Fund the EOA ─────────────────────────────────────────────
    const balance = await publicClient.getBalance({ address: ownerAddress })
    if (balance < 10000000000000000n) { // < 0.01 ETH
      const fundTx = await walletClient.sendTransaction({
        account: ANVIL_FUNDER,
        to: ownerAddress,
        value: 100000000000000000n, // 0.1 ETH
      })
      await waitForTx(fundTx)
    }

    // Mint USDC to the EOA
    const mintData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'mint',
      args: [ownerAddress, BigInt(10_000_000_000)], // 10 000 USDC
    })
    const mintTx = await walletClient.sendTransaction({
      account: ANVIL_FUNDER,
      to: MOCK_USDC,
      data: mintData,
    })
    await waitForTx(mintTx)

    // ── 3. Make commitment ──────────────────────────────────────────
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

    // ── 4. Submit commitment ────────────────────────────────────────
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

    // ── 5. Wait for MIN_COMMITMENT_AGE (should be 0) ────────────────
    let minAge = 0n
    try {
      minAge = await publicClient.readContract({
        address: FAST_TEST_ETH_REGISTRAR,
        abi: REGISTRAR_ABI,
        functionName: 'MIN_COMMITMENT_AGE',
      })
    } catch {
      // Default to 0
    }

    if (minAge > 0n) {
      const waitSec = Number(minAge) + 1
      console.log(
        `[makeV2Name] advancing time ${waitSec}s for MIN_COMMITMENT_AGE`,
      )
      await testClient.increaseTime({ seconds: waitSec })
      await testClient.mine({ blocks: 1 })
    }

    // ── 6. Get rent price ────────────────────────────────────────────
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

    // ── 7. Approve USDC ─────────────────────────────────────────────
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

    // ── 8. Register ─────────────────────────────────────────────────
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

    // ── 9. Set text records (if any) ──────────────────────────────────
    if (config.records?.length) {
      const node = namehash(ethName)
      for (const { key, value } of config.records) {
        const setTextData = encodeFunctionData({
          abi: RESOLVER_ABI,
          functionName: 'setText',
          args: [node, key, value],
        })
        const setTextTx = await walletClient.sendTransaction({
          account: ownerAccount,
          to: resolverAddress,
          data: setTextData,
        })
        await waitForTx(setTextTx)
      }
      console.log(
        `[makeV2Name] set ${config.records.length} record(s) on ${ethName}`,
      )
    }

    console.log(`[makeV2Name] ✅ registered ${ethName}`)
    return ethName
  }
}

// ---------------------------------------------------------------------------
// Resolver deployment helper
// ---------------------------------------------------------------------------

/**
 * Deploy a dedicated resolver proxy via VerifiableFactory, initialized
 * with `owner` having full permissions. Anyone can call deployProxy,
 * so we use ANVIL_FUNDER (no impersonation needed here).
 */
async function deployResolverProxy(
  nameLabel: string,
  owner: Address,
): Promise<Address> {
  const salt = generateResolverSalt(nameLabel)
  const initCalldata = encodeFunctionData({
    abi: RESOLVER_INIT_ABI,
    functionName: 'initialize',
    args: [owner, FULL_ROLE_BITMAP],
  })

  const deployData = encodeFunctionData({
    abi: VERIFIABLE_FACTORY_ABI,
    functionName: 'deployProxy',
    args: [PERMISSIONED_RESOLVER_IMPL, salt, initCalldata],
  })

  const deployTx = await walletClient.sendTransaction({
    account: ANVIL_FUNDER,
    to: VERIFIABLE_FACTORY,
    data: deployData,
  })
  const receipt = await waitForTx(deployTx)

  // Extract the deployed proxy address from the ProxyDeployed event
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: VERIFIABLE_FACTORY_ABI,
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
    `[makeV2Name] ProxyDeployed event not found in resolver deployment receipt`,
  )
}
