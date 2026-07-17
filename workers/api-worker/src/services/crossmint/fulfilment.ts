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
  publicActions,
  type TransactionReceipt,
  walletActions,
  zeroAddress,
  zeroHash,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { SEPOLIA_RPC_URL, sepoliaWithEns } from '#core/eth/client.js'
import { logger } from '#utils/logger.js'
import {
  DEDICATED_RESOLVER_INIT_ABI,
  DEDICATED_RESOLVER_ROLE_BITMAP,
  ENS_REGISTRY_ABI,
  ETH_REGISTRAR_ABI,
  VERIFIABLE_FACTORY_ABI,
  VOUCHER_ABI,
} from './abis.js'
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
  const privateKey = env.ETH_PRIVATE_KEY
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

/** Random uint256 salt for the dedicated-resolver CREATE2 deploy. */
function generateResolverSalt(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return BigInt(
    `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`,
  )
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
 * Deploy a dedicated resolver proxy owned by `owner`, mirroring the manager's
 * registration flow. The commitment must bind to this resolver, so it has to
 * exist before `makeCommitment`.
 */
export async function deployDedicatedResolver(
  client: ServerWalletClient,
  owner: Address,
): Promise<Address> {
  const salt = generateResolverSalt()
  const initData = encodeFunctionData({
    abi: DEDICATED_RESOLVER_INIT_ABI,
    functionName: 'initialize',
    args: [owner, DEDICATED_RESOLVER_ROLE_BITMAP],
  })
  const hash = await client.execWrite({
    to: CONTRACTS.VerifiableFactory,
    data: encodeFunctionData({
      abi: VERIFIABLE_FACTORY_ABI,
      functionName: 'deployProxy',
      args: [CONTRACTS.DedicatedResolverImpl, salt, initData],
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
  return resolver
}

export async function makeCommitment(
  client: ServerWalletClient,
  params: {
    label: string
    owner: Address
    secret: Hex
    resolver: Address
    duration: bigint
  },
): Promise<Hex> {
  return client.readContract({
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

/** Total register price (base + premium) in the payment token's smallest unit. */
export async function getRegisterPriceTotal(
  client: ServerWalletClient,
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
 * Submit the `register` tx. The registration is charged to the payer identity:
 * we register with `owner` = `client.payer` — which in Roles mode is ALSO the
 * `msg.sender` the registrar sees (the Safe, via module execution), so the
 * charge lands on the payer under either charging semantic (`owner`-based per
 * the current deployment, `_msgSender()`-based per the HCA-aware contracts).
 * The name is then transferred to the buyer (see {@link transferName}).
 * Returns the register tx hash + the minted ERC-1155 tokenId.
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
 * Deliver a freshly-registered name to the buyer: transfer the registry's
 * ERC-1155 token from the payer to the buyer. Name roles move with the token
 * (registry `_update`), so the buyer ends up in full control. In Roles mode
 * the Safe must have a fallback handler with ERC-1155 receiver support (the
 * default Safe deployment does) so the register mint can land on it at all.
 */
export async function transferName(
  client: ServerWalletClient,
  params: { tokenId: bigint; to: Address },
): Promise<Hex> {
  const hash = await client.execWrite({
    to: CONTRACTS.Registry,
    data: encodeFunctionData({
      abi: ENS_REGISTRY_ABI,
      functionName: 'safeTransferFrom',
      args: [client.payer, params.to, params.tokenId, 1n, '0x'],
    }),
  })
  await client.waitForTransactionReceipt({ hash })
  return hash
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

/** Deployed Sepolia BYOC voucher contract (public address, inlined for the POC). */
export const VOUCHER_ADDRESS = '0x4137481644498B3b91899D1491d6DbB9C155Fea3'

/**
 * Burn the Crossmint voucher once the name is delivered.
 *
 * Requires BURNER_ROLE on the voucher contract for the payer — the SAFE in
 * Roles mode (granted once by the voucher admin), the EOA in direct mode.
 * Best-effort by design: registration is already complete, and an un-burned
 * voucher is harmless (soulbound, single-use), so a failed burn must never
 * fail the order. Skipped when no voucher tokenId was captured from the
 * `VoucherMinted` webhook event.
 */
export async function burnVoucher(
  client: ServerWalletClient,
  _env: CloudflareBindings,
  tokenId: string | undefined,
): Promise<void> {
  if (!tokenId) {
    logger.info('Voucher burn skipped (no voucher tokenId tracked)', {
      tokenId,
    })
    return
  }
  try {
    const hash = await client.execWrite({
      to: VOUCHER_ADDRESS,
      data: encodeFunctionData({
        abi: VOUCHER_ABI,
        functionName: 'burn',
        args: [BigInt(tokenId)],
      }),
    })
    await client.waitForTransactionReceipt({ hash })
    logger.info('Voucher burned', { tokenId, hash })
  } catch (error) {
    logger.warn('Voucher burn failed (non-fatal; voucher is single-use)', {
      tokenId,
      voucher: VOUCHER_ADDRESS,
      error,
    })
  }
}
