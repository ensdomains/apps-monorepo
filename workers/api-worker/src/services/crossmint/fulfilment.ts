import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getRegisterPrice as ensGetRegisterPrice } from '@ensdomains/ensjs/public/v2'
import { getTokenAddress } from '@rhinestone/sdk'
import { HTTPException } from 'hono/http-exception'
import {
  type Address,
  type Client,
  createClient,
  decodeEventLog,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  http,
  isAddressEqual,
  namehash,
  type PublicActions,
  type PublicClient,
  publicActions,
  type TransactionReceipt,
  type Transport,
  type WalletActions,
  walletActions,
  zeroAddress,
  zeroHash,
} from 'viem'
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts'
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
import type { FulfilmentLeg } from './intent-quote.js'
import { createIntentExecutor, isIntentsTransport } from './intent-transport.js'
import { getRolesConfig, ROLES_MODULE_ABI } from './roles.js'
import type { PaymentToken } from './types.js'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

export const CONTRACTS = {
  ETHRegistrar: ensjsSepolia.ensEthRegistrar.address,
  VerifiableFactory: ensjsSepolia.ensVerifiableFactory.address,
  DedicatedResolverImpl: ensjsSepolia.ensPermissionedResolverImpl.address,
  // The ERC-1155 registry names are minted into. Sourced from ensjs directly:
  // the deployed registrar's `REGISTRY()` getter reverts on Sepolia.
  Registry: ensjsSepolia.ensRegistry.address,
} as const

export const PAYMENT_TOKEN_DECIMALS: Record<PaymentToken, number> = {
  USDC: 6,
  DAI: 18,
}

/**
 * Tokens the SAFE pays the registrar in. USDC is the rail's Circle USDC —
 * the deployed StandardRentPriceOracle accepts it at the same 1:1 ratio as
 * the legacy MockUSDC (verified on-chain via `isPaymentToken` +
 * `getRegisterPrice` parity), and the Roles policy admits it in the
 * register/approve conditions (migration txs 0xd16a8264…, 0x8994378f…,
 * 0x4d72e998…). With buyers also paying the voucher in Circle USDC, the
 * treasury's registrar float self-replenishes from sales — MockUSDC is out
 * of the system entirely. DAI is a card-path vestige the PoC never charges;
 * the register policy no longer admits it.
 */
export const PAYMENT_TOKENS: Record<PaymentToken, Address> = {
  USDC: getTokenAddress('USDC', sepoliaWithEns.id),
  DAI: ensjsSepolia.dai.address,
}

/**
 * Tokens the BUYER pays the voucher in. Same asset as `PAYMENT_TOKENS` now
 * that the whole pipeline runs on the rail's USDC (buyer → voucher →
 * treasury → registrar, and the gasFee split → executor → solvers), but
 * kept as a distinct map because the two legs answer to different
 * authorities: this one MUST be the rail's settlement token
 * (`getTokenAddress`), while `PAYMENT_TOKENS` must be whatever the
 * registrar's oracle accepts — they happen to coincide, on Sepolia by
 * oracle provisioning and on mainnet by there only being one USDC.
 */
export const VOUCHER_PAYMENT_TOKENS: Record<PaymentToken, Address> = {
  USDC: getTokenAddress('USDC', sepoliaWithEns.id),
  DAI: ensjsSepolia.dai.address,
}

// Opaque referrer (none) — matches the manager's REFERER_ADDRESS.
const REFERER = zeroHash
// Subregistry is unused for plain .eth registrations.
const SUBREGISTRY = zeroAddress
// Fallback if the on-chain read fails (production v2 is 60s).
const DEFAULT_MIN_COMMITMENT_AGE = 60n

/**
 * Explicit shape (vs `ReturnType` extraction) so declaration emit references
 * viem's PUBLIC named action types: since viem 2.55, inlining the inferred
 * `.extend()` chain reaches unexported internals (actions/token/*) → TS2883.
 */
export type ServerWalletClient = Client<
  Transport,
  typeof sepoliaWithEns,
  PrivateKeyAccount
> &
  PublicActions<Transport, typeof sepoliaWithEns, PrivateKeyAccount> &
  WalletActions<typeof sepoliaWithEns, PrivateKeyAccount> & {
    payer: Address
    execWrite(tx: { to: Address; data: Hex; leg: FulfilmentLeg }): Promise<Hex>
    /**
     * Execute several calls as ONE intent (intents transport) or sequential
     * txs (raw transport). Returns every produced tx hash — a single fill
     * hash on the intents path (all calls land in that one tx), one hash per
     * call on the raw path. Event parsing must therefore scan ALL returned
     * receipts, not assume a position.
     */
    execBatch(
      txs: Array<{ to: Address; data: Hex; leg: FulfilmentLeg }>,
    ): Promise<Hex[]>
  }

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
export function createServerWalletClient(
  env: CloudflareBindings,
): ServerWalletClient {
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
  // Lazily created on first intents-transport write (one per client/job).
  let intentExecutor: ReturnType<typeof createIntentExecutor> | null = null
  return createClient({
    chain: sepoliaWithEns,
    transport: http(SEPOLIA_RPC_URL),
    account,
  })
    .extend(publicActions)
    .extend(walletActions)
    .extend((client) => {
      /**
       * Execute calls as the payer — ONE intent on the intents transport,
       * sequential EOA txs on raw. Single chokepoint for every mutating call
       * in the fulfilment flow, so the execution modes cannot drift apart.
       *
       * The Roles wrapping is identical for both transports and applied PER
       * CALL (`shouldRevert=true` bubbles inner failures into the outer tx,
       * keeping receipt.status meaningful in Roles mode). `leg` tags let the
       * intents transport size the batch's gas limit from LEG_GAS_LIMITS —
       * transport metadata only, never part of the on-chain call.
       *
       * Returns every produced tx hash: a single fill hash on the intents
       * path (all calls land in that one tx), one hash per call on raw.
       */
      const execBatch = async (
        txs: Array<{ to: Address; data: Hex; leg: FulfilmentLeg }>,
      ): Promise<Hex[]> => {
        const wrapped = txs.map((tx) => ({
          leg: tx.leg,
          ...(roles
            ? {
                to: roles.module,
                data: encodeFunctionData({
                  abi: ROLES_MODULE_ABI,
                  functionName: 'execTransactionWithRole',
                  args: [tx.to, 0n, tx.data, 0, roles.roleKey, true],
                }),
              }
            : { to: tx.to, data: tx.data }),
        }))

        if (isIntentsTransport(env)) {
          intentExecutor ??= createIntentExecutor(env)
          // One intent, N calls, ONE machinery overhead + fill hash.
          return [await intentExecutor(wrapped)]
        }
        // Raw path: sequential EOA txs (await each hash so nonces order).
        const hashes: Hex[] = []
        for (const w of wrapped) {
          hashes.push(await client.sendTransaction({ to: w.to, data: w.data }))
        }
        return hashes
      }

      return {
        /**
         * The identity that funds registrations: holds the payment-token
         * float, grants the registrar allowance, owns freshly-registered
         * names until delivery. The Safe in Roles mode, the EOA in direct
         * mode.
         */
        payer: (roles ? roles.safe : account.address) as Address,
        execWrite: async (tx: {
          to: Address
          data: Hex
          leg: FulfilmentLeg
        }): Promise<Hex> => {
          const [hash] = await execBatch([tx])
          return hash
        },
        execBatch,
      }
    })
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
/** ENSIP-9 coin type for mainnet ETH. */
const COIN_TYPE_ETH = 60n

/**
 * Init calldata for the dedicated-resolver proxy that BOTH initializes it and
 * sets the buyer's ETH address record — so the name resolves to its owner the
 * moment registration completes, with no buyer-side record transaction.
 *
 * Without this, `initialize(owner, bitmap)` grants roles only: a freshly
 * registered name resolves to nothing until the buyer sets records — which in
 * the voucher flow they never otherwise have to do.
 *
 * Mechanics: `deployProxy` executes the init calldata with the FACTORY as
 * `msg.sender`, and the resolver's `multicall` delegatecalls preserve that
 * sender. The buyer holds no roles yet at that point, so the bundle runs the
 * whole sequence AS the factory:
 *
 *   1. initialize(factory, bitmap)  — factory becomes the root-role holder
 *   2. setAddr(namehash, 60, owner) — record write, permitted by (1)
 *   3. grantRootRoles(bitmap, owner)— buyer ends up with the exact roles the
 *                                     plain init used to grant
 *   4. revokeRootRoles(bitmap, factory) — factory strips itself
 *
 * Net state = the previous init + the ETH record. Verified against the
 * deployed Sepolia factory/impl via eth_call, including that the CREATE2
 * proxy address is initData-independent — the order-time resolver precompute
 * and commitment are unaffected.
 */
export function buildResolverInitBundle(owner: Address, label: string): Hex {
  const abi = DEDICATED_RESOLVER_INIT_ABI
  const node = namehash(`${label}.eth`)
  const factory = CONTRACTS.VerifiableFactory
  return encodeFunctionData({
    abi,
    functionName: 'multicall',
    args: [
      [
        encodeFunctionData({
          abi,
          functionName: 'initialize',
          args: [factory, DEDICATED_RESOLVER_ROLE_BITMAP],
        }),
        encodeFunctionData({
          abi,
          functionName: 'setAddr',
          args: [node, COIN_TYPE_ETH, owner],
        }),
        encodeFunctionData({
          abi,
          functionName: 'grantRootRoles',
          args: [DEDICATED_RESOLVER_ROLE_BITMAP, owner],
        }),
        encodeFunctionData({
          abi,
          functionName: 'revokeRootRoles',
          args: [DEDICATED_RESOLVER_ROLE_BITMAP, factory],
        }),
      ],
    ],
  })
}

/**
 * Deploy the buyer's dedicated resolver AND submit the commit as ONE batch —
 * a single intent on the intents transport. The two calls have no on-chain
 * ordering dependency (the commitment is a pure hash over the PRECOMPUTED
 * resolver address), and fusing them saves a whole intent's machinery
 * overhead (~100k gas billed per intent, measured 2026-07-23) plus its fixed
 * fee. On the intents path the batch is atomic: both land or neither does —
 * eliminating the deploy-landed-but-commit-didn't retry states outright.
 *
 * Idempotency (queue retry re-entering `committing`): the resolver's CREATE2
 * address is deterministic (deployer + secret), so re-running `deployProxy`
 * after a landed deploy would collide and revert, wedging the order. If code
 * already exists at the expected address the deploy call is simply omitted
 * and the batch degrades to commit-only.
 */
export async function submitCommitWithResolver(
  client: ServerWalletClient,
  params: {
    owner: Address
    secret: Hex
    expectedResolver: Address
    /** ENS label (no .eth) — used to set records at deploy time. */
    label: string
    commitment: Hex
  },
): Promise<{ hash: Hex; resolver: Address }> {
  const existing = await client.getBytecode({
    address: params.expectedResolver,
  })
  const needDeploy = !existing || existing === '0x'

  const txs: Array<{ to: Address; data: Hex; leg: FulfilmentLeg }> = []
  if (needDeploy) {
    txs.push({
      leg: 'resolverDeploy',
      to: CONTRACTS.VerifiableFactory,
      data: encodeFunctionData({
        abi: VERIFIABLE_FACTORY_ABI,
        functionName: 'deployProxy',
        args: [
          CONTRACTS.DedicatedResolverImpl,
          BigInt(saltToHex(params.secret)),
          buildResolverInitBundle(params.owner, params.label),
        ],
      }),
    })
  }
  txs.push({
    leg: 'commit',
    to: CONTRACTS.ETHRegistrar,
    data: encodeFunctionData({
      abi: ETH_REGISTRAR_ABI,
      functionName: 'commit',
      args: [params.commitment],
    }),
  })

  const hashes = await client.execBatch(txs)
  const receipts = await Promise.all(
    hashes.map((hash) => client.waitForTransactionReceipt({ hash })),
  )

  if (needDeploy) {
    // In Roles mode the receipts are for outer module/fill txs, but the
    // factory's ProxyDeployed event still lands in them (module -> Safe ->
    // factory bubble up within the same transaction), so scanning every
    // returned receipt is transport- and mode-agnostic.
    const resolver = receipts
      .map(parseProxyDeployedAddress)
      .find((a): a is Address => a !== undefined)
    if (!resolver) {
      throw new Error('ProxyDeployed event missing from commit batch receipts')
    }
    if (!isAddressEqual(resolver, params.expectedResolver)) {
      throw new Error(
        `Resolver address mismatch: deployed ${resolver}, expected ${params.expectedResolver}`,
      )
    }
  }
  return { hash: hashes[hashes.length - 1], resolver: params.expectedResolver }
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
 * Assert the payer (the Safe) has granted the registrar enough allowance to
 * pull the registration price. This is a READ-ONLY guard: the allowance is a
 * one-off, standing `USDC.approve(registrar, maxUint256)` set directly by the
 * Safe owner (an ops action), NOT something fulfilment re-approves per order.
 *
 * Why not approve here: the registrar is a fixed, trusted target and the role
 * already confines the executor EOA to registration-only activity — it can't
 * move the Safe's USDC anywhere except into a registration payment — so a
 * standing allowance is safe and removes a whole per-order intent leg. The
 * role's `approve` permission is also capped (≤10k), so an infinite standing
 * approval can only be set owner-direct, not through this path. A missing
 * allowance is therefore an ops/config error, surfaced loudly rather than
 * papered over with a capped (and now unnecessary) approve.
 */
export async function assertRegistrarAllowance(
  client: ServerWalletClient,
  params: { token: Address; amount: bigint },
): Promise<void> {
  const allowance = await client.readContract({
    address: params.token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [client.payer, CONTRACTS.ETHRegistrar],
  })
  if (allowance < params.amount) {
    throw new Error(
      `Registrar allowance too low (${allowance} < ${params.amount}) for payer ${client.payer}. ` +
        `Set the one-off standing approval: Safe → USDC.approve(registrar, maxUint256).`,
    )
  }
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
    leg: 'register',
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
export const VOUCHER_ADDRESS = '0xfd0D6F7152CC59C0eBFef6364c4aB8CaCe9b797d'

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
