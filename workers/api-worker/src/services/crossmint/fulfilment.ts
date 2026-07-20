import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getRegisterPrice as ensGetRegisterPrice } from '@ensdomains/ensjs/public/v2'
import { HTTPException } from 'hono/http-exception'
import {
  type Address,
  createClient,
  decodeEventLog,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  http,
  isAddressEqual,
  type PublicClient,
  publicActions,
  type TransactionReceipt,
  walletActions,
  zeroAddress,
  zeroHash,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  SEPOLIA_RPC_URL,
  sepoliaWithEns,
  type ViemClient,
} from '#core/eth/client.js'
import { logger } from '#utils/logger.js'
import {
  DEDICATED_RESOLVER_INIT_ABI,
  DEDICATED_RESOLVER_ROLE_BITMAP,
  ENS_REGISTRY_ABI,
  ETH_REGISTRAR_ABI,
  VERIFIABLE_FACTORY_ABI,
  VOUCHER_ABI,
} from './abis.js'
import {
  computeCommitment,
  computeResolverAddress,
  saltToHex,
} from './commitment.js'
import { getRolesConfig, ROLES_MODULE_ABI } from './roles.js'
import type { PaymentToken } from './types.js'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

const CONTRACTS = {
  ETHRegistrar: ensjsSepolia.ensEthRegistrar.address,
  VerifiableFactory: ensjsSepolia.ensVerifiableFactory.address,
  DedicatedResolverImpl: ensjsSepolia.ensPermissionedResolverImpl.address,
  // The ERC-1155 registry names are minted into. Sourced from ensjs directly:
  // the deployed registrar's `REGISTRY()` getter reverts on Sepolia.
  Registry: ensjsSepolia.ensRegistry.address,
} as const

export const PAYMENT_TOKENS: Record<PaymentToken, Address> = {
  USDC: ensjsSepolia.usdc.address,
  DAI: ensjsSepolia.dai.address,
}

// Opaque referrer (none) — matches the manager's REFERER_ADDRESS.
const REFERER = zeroHash
// Subregistry is unused for plain .eth registrations.
const SUBREGISTRY = zeroAddress
// Fallback if the on-chain read fails (production v2 is 60s).
const DEFAULT_MIN_COMMITMENT_AGE = 60n

export type ServerWalletClient = ReturnType<typeof createServerWalletClient>

/**
 * The server wallet that registers names on a buyer's behalf after a card
 * payment. Mirrors the faucet wallet in `routes/wallet`, but on the
 * ENS-extended Sepolia chain so `getRegisterPrice` resolves chain contracts.
 *
 * Two execution modes (see `roles.ts`):
 * - Zodiac Roles mode (Safe + Roles modifier configured): writes go through
 *   `execTransactionWithRole`, so the treasury SAFE is `msg.sender` at every
 *   target and `payer` is the Safe. The EOA key only triggers role-scoped
 *   calls and pays gas for the outer tx.
 * - Direct mode (legacy / local dev): writes are plain EOA txs and `payer`
 *   is the EOA itself.
 */
export function createServerWalletClient(env: CloudflareBindings) {
  // Prefer the DEDICATED role-member key. `ETH_PRIVATE_KEY` is the worker's
  // shared ops key (it also runs the faucet in `routes/wallet` — high nonce
  // traffic, large float) and is NOT a member of the registrar role; signing
  // fulfilment with it bounces off the Roles modifier with NotAuthorized.
  // The member key is the dust-only executor EOA assigned on-chain by
  // `setup-zodiac-roles.ts` (see docs/zodiac-roles.md). The fallback keeps
  // local-dev / direct-EOA mode working with a single key.
  const privateKey = env.REGISTRAR_MEMBER_PRIVATE_KEY ?? env.ETH_PRIVATE_KEY
  if (!privateKey || !privateKey.startsWith('0x')) {
    throw new HTTPException(500, {
      message: 'Server is not configured to register names',
    })
  }
  const roles = getRolesConfig(env)
  const account = privateKeyToAccount(privateKey as Hex)
  return createClient({
    chain: sepoliaWithEns,
    transport: http(SEPOLIA_RPC_URL),
    account,
  })
    .extend(publicActions)
    .extend(walletActions)
    .extend((client) => ({
      /**
       * The identity that funds registrations: holds the payment-token float,
       * grants the registrar allowance, owns freshly-registered names until
       * delivery. The Safe in Roles mode, the EOA in direct mode.
       */
      payer: (roles ? roles.safe : account.address) as Address,
      /**
       * Submit an on-chain write as the payer. Single chokepoint for every
       * mutating call in the fulfilment flow, so the two execution modes
       * cannot drift apart. `shouldRevert=true` bubbles inner failures into
       * the outer tx, keeping receipt.status meaningful in Roles mode.
       */
      async execWrite(tx: { to: Address; data: Hex }): Promise<Hex> {
        if (!roles) return client.sendTransaction(tx)
        return client.writeContract({
          address: roles.module,
          abi: ROLES_MODULE_ABI,
          functionName: 'execTransactionWithRole',
          args: [tx.to, 0n, tx.data, 0, roles.roleKey, true],
        })
      },
    }))
}

/** 32-byte commit-reveal secret from a CSPRNG (never Math.random server-side). */
export function generateSecret(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Fix the counterfactual resolver address and the buyer-bound commitment at
 * ORDER time, so the voucher can be minted carrying that commitment and
 * fulfilment can later verify it (see fulfilment note in commitment.ts). Reads
 * the factory's immutable `proxyLogic` once; everything else is a pure CREATE2 /
 * keccak derivation. `deployer` must be the identity that will call
 * `deployProxy` during fulfilment — the payer (Safe in Roles mode, EOA in
 * direct mode).
 *
 * Takes a `PublicClient` (read-only, no wallet/roles config needed) + the
 * `deployer` address explicitly, so the `/orders` route can precompute without
 * triggering the fail-closed guard in `createServerWalletClient`.
 *
 * Callers that already have a full `ServerWalletClient` pass it as the client
 * (it satisfies `PublicClient` structurally) and extract the deployer from
 * `client.payer`.
 */
export async function precomputeOrderCommitment(
  client: Pick<PublicClient, 'readContract'>,
  deployer: Address,
  params: { label: string; buyer: Address; secret: Hex; duration: bigint },
): Promise<{ resolver: Address; commitment: Hex }> {
  const proxyLogic = await client.readContract({
    address: CONTRACTS.VerifiableFactory,
    abi: VERIFIABLE_FACTORY_ABI,
    functionName: 'proxyLogic',
  })
  const resolver = computeResolverAddress({
    factory: CONTRACTS.VerifiableFactory,
    proxyLogic,
    deployer,
    secret: params.secret,
  })
  const commitment = computeCommitment({
    label: params.label,
    owner: params.buyer,
    secret: params.secret,
    subregistry: SUBREGISTRY,
    resolver,
    duration: params.duration,
    referrer: REFERER,
  })
  return { resolver, commitment }
}

function parseProxyDeployedAddress(
  receipt: TransactionReceipt,
): Address | undefined {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: VERIFIABLE_FACTORY_ABI,
        data: log.data,
        topics: log.topics,
      })
      if (decoded.eventName === 'ProxyDeployed') {
        return decoded.args.proxyAddress
      }
    } catch {
      // not a ProxyDeployed log
    }
  }
  return undefined
}

/**
 * Deploy the buyer's dedicated resolver at its precomputed CREATE2 address,
 * using the deterministic salt derived from the order secret (so the address
 * matches the one baked into the order's commitment). Deploying through
 * `client.execWrite` means the factory sees the payer as `msg.sender` — the same
 * identity used in the precompute, so `deployed === expectedResolver` is
 * asserted as a tripwire against any drift.
 */
export async function deployDedicatedResolver(
  client: ServerWalletClient,
  params: { owner: Address; secret: Hex; expectedResolver: Address },
): Promise<Address> {
  const initData = encodeFunctionData({
    abi: DEDICATED_RESOLVER_INIT_ABI,
    functionName: 'initialize',
    args: [params.owner, DEDICATED_RESOLVER_ROLE_BITMAP],
  })
  const hash = await client.execWrite({
    to: CONTRACTS.VerifiableFactory,
    data: encodeFunctionData({
      abi: VERIFIABLE_FACTORY_ABI,
      functionName: 'deployProxy',
      args: [
        CONTRACTS.DedicatedResolverImpl,
        BigInt(saltToHex(params.secret)),
        initData,
      ],
    }),
  })
  // In Roles mode the receipt is for the outer module tx, but the factory's
  // ProxyDeployed event still lands in it (module -> Safe -> factory bubble up
  // within the same transaction), so the parse below is mode-agnostic.
  const receipt = await client.waitForTransactionReceipt({ hash })
  const resolver = parseProxyDeployedAddress(receipt)
  if (!resolver) {
    throw new Error('ProxyDeployed event missing from resolver deploy receipt')
  }
  if (!isAddressEqual(resolver, params.expectedResolver)) {
    throw new Error(
      `Resolver address mismatch: deployed ${resolver}, expected ${params.expectedResolver}`,
    )
  }
  return resolver
}

/**
 * Assert the local commitment reconstruction matches the on-chain
 * `makeCommitment`. Cheap insurance that {@link computeCommitment}'s ABI stays
 * in lockstep with the registrar — a mismatch fails the order loudly instead of
 * silently binding a wrong commitment.
 */
export async function assertCommitmentMatchesChain(
  client: ServerWalletClient,
  params: {
    label: string
    owner: Address
    secret: Hex
    resolver: Address
    duration: bigint
    expected: Hex
  },
): Promise<void> {
  const onchain = await client.readContract({
    address: CONTRACTS.ETHRegistrar,
    abi: ETH_REGISTRAR_ABI,
    functionName: 'makeCommitment',
    args: [
      params.label,
      params.owner,
      params.secret,
      SUBREGISTRY,
      params.resolver,
      params.duration,
      REFERER,
    ],
  })
  if (onchain.toLowerCase() !== params.expected.toLowerCase()) {
    throw new Error(
      `Commitment mismatch: local ${params.expected}, on-chain ${onchain}`,
    )
  }
}

/** Submit the commit tx and wait for it to land. Returns the tx hash. */
export async function submitCommit(
  client: ServerWalletClient,
  commitment: Hex,
): Promise<Hex> {
  const hash = await client.execWrite({
    to: CONTRACTS.ETHRegistrar,
    data: encodeFunctionData({
      abi: ETH_REGISTRAR_ABI,
      functionName: 'commit',
      args: [commitment],
    }),
  })
  await client.waitForTransactionReceipt({ hash })
  return hash
}

export async function readMinCommitmentAge(
  client: ServerWalletClient,
): Promise<bigint> {
  try {
    return await client.readContract({
      address: CONTRACTS.ETHRegistrar,
      abi: ETH_REGISTRAR_ABI,
      functionName: 'MIN_COMMITMENT_AGE',
    })
  } catch (error) {
    logger.warn('Failed to read MIN_COMMITMENT_AGE, defaulting', { error })
    return DEFAULT_MIN_COMMITMENT_AGE
  }
}

/**
 * Total register price (base + premium) in the payment token's smallest unit.
 * Read-only — accepts the server wallet client (queue consumer) or a plain
 * ens-chain public client (the settle route).
 */
export async function getRegisterPriceTotal(
  client: ServerWalletClient | ViemClient,
  params: { label: string; duration: bigint; paymentToken: Address },
): Promise<bigint> {
  const { base, premium } = await ensGetRegisterPrice(client, {
    label: params.label,
    duration: params.duration,
    paymentToken: params.paymentToken,
  })
  return base + premium
}

/**
 * The token amount to approve for a single registration: live price + 10%
 * headroom (the registrar pulls the live price at register time, which can
 * drift from the quote). Mirrors the manager's `authorizedPaymentAmount`.
 */
export function authorizedPaymentAmount(price: bigint): bigint {
  return price + price / 10n
}

/**
 * Approve the registrar to pull `amount` of `token` from the payer (skipped if
 * the existing allowance already covers it). In Roles mode the allowance is the
 * SAFE's — it doubles as the blast-radius cap for a leaked worker key, which is
 * why the role's approve permission pins the spender to the registrar and caps
 * the per-call amount.
 */
export async function ensureTokenAllowance(
  client: ServerWalletClient,
  params: { token: Address; amount: bigint },
): Promise<void> {
  const allowance = await client.readContract({
    address: params.token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [client.payer, CONTRACTS.ETHRegistrar],
  })
  if (allowance >= params.amount) return
  const hash = await client.execWrite({
    to: params.token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [CONTRACTS.ETHRegistrar, params.amount],
    }),
  })
  await client.waitForTransactionReceipt({ hash })
}

function parseRegisteredTokenId(
  receipt: TransactionReceipt,
): bigint | undefined {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: ETH_REGISTRAR_ABI,
        data: log.data,
        topics: log.topics,
      })
      if (decoded.eventName === 'NameRegistered') {
        return decoded.args.tokenId
      }
    } catch {
      // not a NameRegistered log
    }
  }
  return undefined
}

/**
 * Submit the `register` tx, minting the name straight to the BUYER. The
 * registrar charges `msg.sender` — verified: `register` does
 * `safeTransferFrom(paymentToken, msg.sender, BENEFICIARY, ...)`, not the
 * `owner` arg — so the payer (the Safe, via the Roles modifier) funds the
 * registration while `owner = buyer` receives the name. No transfer step, and
 * the buyer-bound `owner` is exactly what the order's voucher commitment
 * committed to. Returns the register tx hash + the minted ERC-1155 tokenId.
 */
export async function submitRegister(
  client: ServerWalletClient,
  params: {
    label: string
    owner: Address
    secret: Hex
    resolver: Address
    duration: bigint
    paymentToken: Address
  },
): Promise<{ hash: Hex; tokenId: bigint }> {
  const hash = await client.execWrite({
    to: CONTRACTS.ETHRegistrar,
    data: encodeFunctionData({
      abi: ETH_REGISTRAR_ABI,
      functionName: 'register',
      args: [
        params.label,
        params.owner,
        params.secret,
        SUBREGISTRY,
        params.resolver,
        params.duration,
        params.paymentToken,
        REFERER,
      ],
    }),
  })
  const receipt = await client.waitForTransactionReceipt({ hash })
  const tokenId = parseRegisteredTokenId(receipt)
  if (tokenId === undefined) {
    throw new Error('NameRegistered event missing from register receipt')
  }
  return { hash, tokenId }
}

/**
 * Verify the voucher stored the exact commitment this order will register, before
 * spending anything. The commitment binds (label, buyer, secret, resolver,
 * duration) — so a match proves the on-chain paid-for artifact authorizes exactly
 * this registration and no other. `commitmentOf` returns zero after burn or for a
 * nonexistent id, which never matches a real commitment, so this also rejects a
 * missing/burned voucher.
 */
export async function assertVoucherCommitment(
  client: ServerWalletClient,
  params: { voucherTokenId: bigint; expected: Hex },
): Promise<void> {
  const stored = await client.readContract({
    address: VOUCHER_ADDRESS,
    abi: VOUCHER_ABI,
    functionName: 'commitmentOf',
    args: [params.voucherTokenId],
  })
  if (stored.toLowerCase() !== params.expected.toLowerCase()) {
    throw new Error(
      `Voucher commitment mismatch: stored ${stored}, expected ${params.expected}`,
    )
  }
}

/**
 * Confirm the name landed with the expected owner. Checks the registry's
 * ERC-1155 `ownerOf(tokenId)` (the deployed registry's `getOwner(string)`
 * getter reverts, so we verify by tokenId).
 */
export async function verifyRegistration(
  client: ServerWalletClient,
  params: { tokenId: bigint; owner: Address },
): Promise<boolean> {
  const owner = await client.readContract({
    address: CONTRACTS.Registry,
    abi: ENS_REGISTRY_ABI,
    functionName: 'ownerOf',
    args: [params.tokenId],
  })
  return (
    !isAddressEqual(owner, zeroAddress) && isAddressEqual(owner, params.owner)
  )
}

/**
 * Deployed Sepolia voucher contract (public address, inlined for the POC).
 * v2 deployment with `mintSelf`/`mintSelfWithPermit` — must match the address
 * the manager client mints against (`getVoucherAddress()` in
 * @ens-apps/transaction-manager registration.actors.ts).
 */
export const VOUCHER_ADDRESS = '0x6Fc426D667B49e3949ced241653aC2fb7721E8Ed'

/**
 * Burn the Crossmint voucher once the name is delivered.
 *
 * NOT part of the worker role. A blanket `burn(uint256)` capability on the
 * worker key is a destructive footgun: `BURNER_ROLE` can burn ANY voucher id,
 * so a leaked worker key could destroy other customers' unfulfilled paid
 * vouchers (there's no per-order on-chain binding the voucher can enforce, since
 * the label — hence the name tokenId — is kept off-chain). Since an un-burned
 * voucher is harmless (soulbound, single-use), burning is pure cosmetic cleanup
 * and is deliberately left to a separate privileged/ops path that holds
 * `BURNER_ROLE` — the worker Safe is NOT granted it. This is a logged no-op.
 */
export async function burnVoucher(
  _client: ServerWalletClient,
  _env: CloudflareBindings,
  tokenId: string | undefined,
): Promise<void> {
  logger.info(
    'Voucher burn is not a worker capability (ops-only); leaving voucher intact',
    { tokenId, voucher: VOUCHER_ADDRESS },
  )
}
