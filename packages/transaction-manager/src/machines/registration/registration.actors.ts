/**
 * Registration Actor Functions
 *
 * Pure functions for ENS registration operations.
 */

import { requireChainId, requireEnsChain } from '@ens-apps/config'
import {
  computeResolverSalt,
  computeVerifiableProxyAddress,
  getDestinationContracts,
} from '@ens-apps/smart-account'
import {
  ethRegistrarCommitmentsSnippet,
  ethRegistrarCommitSnippet,
  ethRegistrarGetRegisterPriceSnippet,
  ethRegistrarMakeCommitmentSnippet,
  ethRegistrarRegisterSnippet,
  ethRegistrarRenewSnippet,
} from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import {
  permissionedRegistryGetResolverSnippet,
  permissionedRegistryGetSubregistrySnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { permissionedResolverInitializeSnippet } from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import { errAsync, fromPromise, ResultAsync } from 'neverthrow'
import type {
  Address,
  Hash,
  Hex,
  MulticallErrorType,
  PublicClient,
  TransactionReceipt,
} from 'viem'
import {
  bytesToHex,
  type Chain,
  decodeEventLog,
  encodeFunctionData,
  erc20Abi,
  getChainContractAddress,
  isAddressEqual,
  parseAbi,
  zeroAddress,
  zeroHash,
} from 'viem'
import { getBlock, multicall, readContract } from 'viem/actions'
import type { Signer } from '../..'
import { VERIFIABLE_FACTORY_ABI } from '../../contracts/abis/VerifiableFactory.abi'
import { getSmartAccountAddress } from '../../helpers/getSmartAccountAddress'

// `MIN_COMMITMENT_AGE` is an immutable on ETHRegistrar; ensjs-abi does not (yet)
// expose a dedicated snippet for it.
const ethRegistrarMinCommitmentAgeSnippet = parseAbi([
  'function MIN_COMMITMENT_AGE() view returns (uint64)',
])

import { assertPaymentTokenSupported } from '../../contracts/paymentToken'
import {
  awaitTransactionOutcome,
  isErrorSnapshot,
  isSuccessSnapshot,
  type ReadOutcome,
} from '../../helpers/awaitTransactionOutcome'
import { waitForTransactionReceiptById } from '../../helpers/transaction-status.helpers'
import { transactionManager } from '../../providers/transactionManager'
import type { Call, TransactionRequest } from '../../types/transaction.types'

type CommitmentData = {
  commitment: Hash
  secret: Hash
}

const DEDICATED_RESOLVER_ROLE_BITMAP = BigInt(
  '0x1111111111111111111111111111111111111111111111111111111111111111',
)

/**
 * The ERC-20 amount to approve for a single EOA registration/renewal at
 * `price`. Deliberately NOT unlimited: the registrar pulls the live rent price
 * (no max-price arg), which can drift slightly between quote and execution; we
 * add 10% headroom to absorb that while keeping the allowance tightly scoped.
 * (Used only on the pure-EOA `approve` path — the HCA path funds via permit.)
 */
function authorizedPaymentAmount(price: bigint): bigint {
  return price + price / 10n
}

// ============================================================================
// Helper Functions (only used in this file)
// ============================================================================

/**
 * `PermissionedResolver.initialize(Grant[] grants, bytes[] calls)`. The name's
 * dedicated resolver is deployed with no initial records, so `calls` is empty.
 */
function getResolverInitCalldata(ownerAddress: Address): Hex {
  return encodeFunctionData({
    abi: permissionedResolverInitializeSnippet,
    functionName: 'initialize',
    args: [
      [{ account: ownerAddress, roleBitmap: DEDICATED_RESOLVER_ROLE_BITMAP }],
      [],
    ],
  })
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
        return decoded.args.proxyAddress as Address
      }
    } catch {
      // Ignore non-matching logs
    }
  }
  return undefined
}

/**
 * Generate commitment hash via contract call
 * Note: Uses makeCommitment (NOT makeCommitmentWithToken)
 * Payment token is specified during registration, not commitment
 */
function generateCommitment(
  publicClient: PublicClient,
  name: string,
  ownerAddress: Address,
  duration: bigint,
  resolverAddress: Address,
  registrarAddress?: Address,
): ResultAsync<CommitmentData, Error> {
  const registrar =
    registrarAddress ??
    getChainContractAddress({
      chain: requireEnsChain(publicClient, 'registration'),
      contract: 'ensEthRegistrar',
    })
  const cleanName = name.replace('.eth', '')
  if (
    typeof crypto === 'undefined' ||
    typeof crypto.getRandomValues !== 'function'
  ) {
    return errAsync(new Error('crypto.getRandomValues is not available'))
  }
  const secretBytes = crypto.getRandomValues(new Uint8Array(32))
  const secret = bytesToHex(secretBytes) as Hash

  return fromPromise(
    (async () => {
      const commitment = await readContract(publicClient, {
        address: registrar,
        abi: ethRegistrarMakeCommitmentSnippet,
        functionName: 'makeCommitment',
        args: [
          cleanName,
          ownerAddress,
          secret,
          zeroAddress,
          resolverAddress,
          duration,
          zeroHash,
        ],
      })
      return { commitment, secret }
    })(),
    (error) => {
      console.error('❌ Failed to generate commitment:', error)
      return new Error(`Failed to generate commitment: ${error}`)
    },
  )
}

/**
 * Encode commitment transaction data
 */
function encodeCommitmentData(commitment: Hash): Hash {
  return encodeFunctionData({
    abi: ethRegistrarCommitSnippet,
    functionName: 'commit',
    args: [commitment],
  })
}

/**
 * Encode token approval transaction data.
 *
 * Scoped approve to the registrar — NOT unlimited. The ENS registrar pulls the
 * payment token from the name owner (the EOA) on registration; on the pure-EOA
 * fallback path that approve is a direct EOA tx (the HCA path uses a gasless
 * EIP-2612 permit instead). We approve only this registration's price plus a
 * small headroom, matching the permit path, so a stale/compromised registrar
 * approval can never drain more than one registration's worth.
 */
function encodeTokenApprovalData(
  registrarAddress: Address,
  value: bigint,
): Hash {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [registrarAddress, value],
  })
}

/**
 * A signed EIP-2612 permit (shared type, produced by the HCA funding-permit
 * actor and consumed when encoding the `permit(...)` call).
 */
export type PermitSignature = {
  owner: Address
  spender: Address
  value: bigint
  deadline: bigint
  v: number
  r: Hex
  s: Hex
}

/** Shared `ETHRegistrar.register` call for submit + gas estimate. */
export function encodeRegisterCall({
  name,
  owner,
  secret,
  duration,
  paymentToken,
  resolverAddress,
  registrarAddress,
}: {
  name: string
  owner: Address
  secret: Hash
  duration: bigint
  paymentToken: Address
  resolverAddress: Address
  registrarAddress: Address
}): { to: Address; data: Hex; value: bigint } {
  return {
    to: registrarAddress,
    data: encodeFunctionData({
      abi: ethRegistrarRegisterSnippet,
      functionName: 'register',
      args: [
        name.replace('.eth', ''),
        owner,
        secret,
        zeroAddress,
        resolverAddress,
        duration,
        paymentToken,
        zeroHash,
      ],
    }),
    value: 0n,
  }
}

export type TOKEN_SYMBOL = 'USDC' | 'DAI'

export const PAYMENT_TOKEN_CONTRACT = { USDC: 'usdc', DAI: 'dai' } as const

function getPaymentTokenAddress(token: TOKEN_SYMBOL, chain: Chain): Address {
  return getChainContractAddress({
    chain,
    contract: PAYMENT_TOKEN_CONTRACT[token],
  })
}

export function getSignerAddress(signer: Signer): Address {
  if (signer.type === 'eoa') {
    const account = signer.walletClient.account

    if (!account) {
      throw new Error('EOA wallet client has no account connected')
    }
    return account.address
  }

  if (signer.type === 'rhinestone') {
    // Delegate so the cached-address verification lives in one place.
    return getSmartAccountAddress(signer)
  }

  signer satisfies never
  throw new Error('Only EOA or Rhinestone signer is supported for registration')
}

/**
 * Create a transaction request based on signer type.
 *
 * `calls` is the single source of truth for the call data. For an EOA signer
 * the request is a single on-chain transaction, so exactly one call is allowed
 * and its `{ to, data, value }` become the request's top-level fields. For a
 * Rhinestone signer the calls are submitted as a batched intent and stored
 * verbatim in `rhinestoneParams.calls`; there is no separate top-level copy to
 * keep in sync. This removes the previous "two sources of truth" footgun where
 * callers passed a top-level call that could disagree with `calls`.
 */
export function createTransactionRequest(params: {
  signer: Signer
  from: Address
  chainId: number
  calls: Call[]
}): TransactionRequest {
  const { signer, from, chainId, calls } = params

  if (calls.length === 0) {
    throw new Error('createTransactionRequest requires at least one call')
  }

  if (signer.type === 'eoa') {
    if (calls.length > 1) {
      throw new Error(
        'EOA transaction requests support a single call; received a batch. ' +
          'Use a Rhinestone signer for multi-call intents.',
      )
    }
    // biome-ignore lint/style/noNonNullAssertion: length checked above
    const call = calls[0]!
    return {
      type: 'eoa',
      from,
      to: call.to,
      data: call.data,
      value: call.value,
      chainId,
    }
  }

  if (signer.type === 'rhinestone') {
    return {
      type: 'rhinestone-intent',
      from,
      chainId,
      rhinestoneParams: { calls },
    }
  }

  signer satisfies never
  throw new Error('Unsupported signer type for transaction request')
}

// ============================================================================
// Actor Functions (exported for use with fromResultAsync in machine)
// ============================================================================

/**
 * The address of the wallet's own resolver, deployed or not.
 *
 * The salt is fixed per owner and the factory namespaces it by the deployer,
 * so every registration from one wallet points at the same resolver: the first
 * deploys it and the rest reuse it. Same salt as manager's resolvers
 * (`computeResolverSalt`).
 */
export function computeDedicatedResolverAddress(input: {
  readonly chainId: number
  /** The account that calls `deployProxy`. */
  readonly deployer: Address
  /** The account the resolver grants its roles to. */
  readonly owner: Address
}): Address {
  const contracts = getDestinationContracts(input.chainId)
  return computeVerifiableProxyAddress({
    factory: contracts.verifiableFactory,
    proxyLogic: contracts.verifiableFactoryProxyLogic,
    deployer: input.deployer,
    salt: computeResolverSalt(input.owner),
  })
}

/**
 * Whether a `getCode` read found a deployed contract. viem answers "no code" as
 * `undefined`, wagmi as `null`, and some nodes as a bare `0x`; all mean none.
 */
export function hasDeployedCode(code: Hex | null | undefined): boolean {
  return Boolean(code && code !== '0x')
}

/**
 * Find the wallet's resolver and whether it still has to be deployed.
 */
export function checkResolverDeploymentActor(input: {
  readonly owner: Address
  readonly signer: Signer
  readonly publicClient: PublicClient
}): ResultAsync<{ resolverAddress: Address; deployed: boolean }, Error> {
  return fromPromise(
    (async () => {
      const resolverAddress = computeDedicatedResolverAddress({
        chainId: requireChainId(input.publicClient, 'registration'),
        deployer: getSignerAddress(input.signer),
        owner: input.owner,
      })
      const code = await input.publicClient.getCode({
        address: resolverAddress,
      })
      return { resolverAddress, deployed: hasDeployedCode(code) }
    })(),
    (error) => new Error(`Failed to check resolver deployment: ${error}`),
  )
}

/**
 * Deploy the wallet's resolver proxy through the verifiable factory
 */
export function submitResolverDeploymentActor(input: {
  name: string
  owner: Address
  signer: import('../..').Signer
  publicClient: PublicClient
  id?: string
}): ResultAsync<{ txId: string; salt: bigint }, Error> {
  return ResultAsync.fromPromise(
    Promise.resolve().then(() => {
      const accountAddress = getSignerAddress(input.signer)
      const salt = computeResolverSalt(input.owner)
      const chain = requireEnsChain(input.publicClient, 'registration')

      const request = createTransactionRequest({
        signer: input.signer,
        from: accountAddress,
        chainId: chain.id,
        calls: [
          encodeDeployDedicatedResolverCall({ owner: input.owner, chain }),
        ],
      })

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request,
        },
        input.signer,
        {
          id: input.id,
          description: `Deploy dedicated resolver for ${input.name}.eth`,
          publicClient: input.publicClient,
          timeout: 120_000,
        },
      )

      return { txId, salt }
    }),
    (error) => new Error(`Failed to submit resolver deployment: ${error}`),
  )
}

/**
 * The `VerifiableFactory.deployProxy` call that deploys the wallet's resolver.
 * Exported so the app can build the SAME deploy call for its pre-start gas
 * estimate (wrapped as an EOA intent), keeping the estimate byte-identical to
 * what {@link submitResolverDeploymentActor} submits — the encoding lives in
 * one place and can't drift.
 */
export function encodeDeployDedicatedResolverCall(input: {
  owner: Address
  chain: Chain
}): { to: Address; data: Hex; value: bigint } {
  return {
    to: getChainContractAddress({
      chain: input.chain,
      contract: 'ensVerifiableFactory',
    }),
    data: encodeFunctionData({
      abi: VERIFIABLE_FACTORY_ABI,
      functionName: 'deployProxy',
      args: [
        getChainContractAddress({
          chain: input.chain,
          contract: 'ensPermissionedResolverImpl',
        }),
        computeResolverSalt(input.owner),
        getResolverInitCalldata(input.owner),
      ],
    }),
    value: 0n,
  }
}

/**
 * Wait for resolver deployment transaction and extract deployed proxy address
 */
export function resolveResolverDeploymentActor(input: {
  txId: string
}): ResultAsync<{ resolverAddress: Address }, Error> {
  return fromPromise(
    (async () => {
      const receipt = await waitForTransactionReceiptById(input.txId)
      const resolverAddress = parseProxyDeployedAddress(receipt)

      if (!resolverAddress) {
        throw new Error(
          'ProxyDeployed event not found in resolver deployment receipt',
        )
      }

      return { resolverAddress }
    })(),
    (error) => error as Error,
  )
}

/**
 * Generate commitment for ENS registration
 */
export function generateCommitmentActor(input: {
  name: string
  owner: Address
  duration: bigint
  publicClient: PublicClient
  selectedToken: TOKEN_SYMBOL
  resolverAddress: Address
}): ResultAsync<CommitmentData, Error> {
  const registrarAddress = getChainContractAddress({
    chain: requireEnsChain(input.publicClient, 'registration'),
    contract: 'ensEthRegistrar',
  })

  return generateCommitment(
    input.publicClient,
    input.name,
    input.owner,
    input.duration,
    input.resolverAddress,
    registrarAddress,
  )
}

/**
 * Submit commitment transaction via transaction manager
 */
export function submitCommitmentActor(input: {
  commitment: CommitmentData
  signer: import('../..').Signer
  name: string
  duration: bigint
  publicClient: PublicClient
  id?: string
}): ResultAsync<string, Error> {
  const registrarAddress = getChainContractAddress({
    chain: requireEnsChain(input.publicClient, 'registration'),
    contract: 'ensEthRegistrar',
  })

  return fromPromise(
    (async () => {
      console.log(
        `🔧 [REGISTRATION ACTOR] submitCommitmentActor called with:`,
        {
          hasPublicClient: !!input.publicClient,
          hasSigner: !!input.signer,
          signerType: input.signer?.type,
          name: input.name,
        },
      )

      const accountAddress = getSignerAddress(input.signer)

      const commitmentData = encodeCommitmentData(input.commitment.commitment)

      console.log(
        `🔧 [REGISTRATION ACTOR] About to call startTransaction with publicClient:`,
        !!input.publicClient,
      )

      const request = createTransactionRequest({
        signer: input.signer,
        from: accountAddress,
        chainId: requireChainId(input.publicClient, 'registration'),
        calls: [
          {
            to: registrarAddress,
            data: commitmentData,
            value: 0n,
          },
        ],
      })

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request,
        },
        input.signer,
        {
          id: input.id,
          description: `Commit to register ${input.name}.eth`,
          publicClient: input.publicClient,
          timeout: 120_000,
        },
      )

      return txId
    })(),
    (error) => error as Error,
  )
}

/**
 * Read MIN_COMMITMENT_AGE from the registrar contract so the cooldown timer
 * matches the deployment (60s on the production v2 ETHRegistrar).
 */
export function readMinCommitmentAgeActor(input: {
  publicClient: PublicClient
  /** Override for the standalone-HCA registrar; defaults to the EOA deployment. */
  registrarAddress?: Address
}): ResultAsync<bigint, Error> {
  const registrarAddress =
    input.registrarAddress ??
    getChainContractAddress({
      chain: requireEnsChain(input.publicClient, 'registration'),
      contract: 'ensEthRegistrar',
    })
  return fromPromise(
    readContract(input.publicClient, {
      address: registrarAddress,
      abi: ethRegistrarMinCommitmentAgeSnippet,
      functionName: 'MIN_COMMITMENT_AGE',
    }),
    (error) => {
      console.warn(
        '⚠️ [REGISTRATION ACTOR] Failed to read MIN_COMMITMENT_AGE, defaulting to 60s:',
        error,
      )
      return error as Error
    },
  )
}

/**
 * Read the current ERC20 allowance the spender (registrar) has on the user's
 * payment token. Used by the renewal flows, whose price comes from the renew
 * quote; the registration machine uses `readPaymentAuthorizationActor` below,
 * which pairs the allowance with the live register price.
 */
export function readPaymentTokenAllowanceActor(input: {
  owner: Address
  selectedToken: TOKEN_SYMBOL
  publicClient: PublicClient
  /** Spender to read the allowance for. Defaults to the legacy registrar. */
  registrarAddress?: Address
  /** Payment token to read. Defaults to the legacy mock token for the symbol. */
  paymentTokenAddress?: Address
}): ResultAsync<bigint, Error> {
  const registrarAddress =
    input.registrarAddress ??
    getChainContractAddress({
      chain: requireEnsChain(input.publicClient, 'registration'),
      contract: 'ensEthRegistrar',
    })
  const tokenAddress =
    input.paymentTokenAddress ??
    getPaymentTokenAddress(
      input.selectedToken,
      requireEnsChain(input.publicClient, 'registration'),
    )
  return fromPromise(
    readContract(input.publicClient, {
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [input.owner, registrarAddress],
    }),
    (error) => error as Error,
  )
}

/**
 * Read, in one round-trip, the registrar's current allowance on the user's
 * payment token and the live register price. The approval must be for the live
 * price, never the UI quote: the quote was taken when the token was picked,
 * while the registrar pulls the CURRENT price at settlement, so an approval
 * for a stale (lower) quote makes register revert ERC20InsufficientAllowance.
 */
export function readPaymentAuthorizationActor(input: {
  owner: Address
  name: string
  duration: bigint
  selectedToken: TOKEN_SYMBOL
  publicClient: PublicClient
  /** Spender/pricer to read. Defaults to the legacy registrar. */
  registrarAddress?: Address
  /** Payment token to read. Defaults to the legacy mock token for the symbol. */
  paymentTokenAddress?: Address
}): ResultAsync<{ allowance: bigint; livePrice: bigint }, MulticallErrorType> {
  const registrarAddress =
    input.registrarAddress ??
    getChainContractAddress({
      chain: requireEnsChain(input.publicClient, 'registration'),
      contract: 'ensEthRegistrar',
    })
  const tokenAddress =
    input.paymentTokenAddress ??
    getPaymentTokenAddress(
      input.selectedToken,
      requireEnsChain(input.publicClient, 'registration'),
    )
  const label = input.name.replace('.eth', '')
  return fromPromise(
    (async () => {
      const [allowance, [base, premium]] = await multicall(input.publicClient, {
        allowFailure: false,
        contracts: [
          {
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [input.owner, registrarAddress],
          },
          {
            address: registrarAddress,
            abi: ethRegistrarGetRegisterPriceSnippet,
            functionName: 'getRegisterPrice',
            args: [label, input.duration, tokenAddress],
          },
        ],
      })
      return { allowance, livePrice: base + premium }
    })(),
    (error) => error as MulticallErrorType,
  )
}

/** How long on-chain verification keeps re-reading before giving up. */
export const VERIFY_GRACE_WINDOW_MS = 30_000
/** Gap between verification reads inside the grace window. */
export const VERIFY_POLL_INTERVAL_MS = 5_000

/**
 * Tuning for the verification grace-poll. `graceWindowMs: 0` degrades to a
 * single read, which is what tests want when they are not exercising the poll.
 */
export type VerifyPollOptions = {
  graceWindowMs?: number
  pollIntervalMs?: number
  /** Abort the poll early — wired to the XState actor's signal. */
  signal?: AbortSignal
  /**
   * Consulted ONCE, only after the first read has already come back
   * unverified — the chain stays authoritative. Return true when the awaited
   * transaction is definitively dead (e.g. the orchestrator reports its
   * intent FAILED/EXPIRED) and the grace window would be waiting for a state
   * that cannot appear. A throw is treated as inconclusive: keep polling.
   */
  isDefinitivelyDead?: () => Promise<boolean>
}

function sleepUnlessAborted(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve()

    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Re-read `check` until it verifies or the grace window closes.
 *
 * A single read is not enough on the standalone-HCA route: intents keep filling
 * SERVER-SIDE after the tab closes, so a reload lands in `verifyingRegistration`
 * while the register call is still seconds from confirming. A single-shot read
 * there reports a false failure and pushes the user into a retry for a name
 * they are about to own.
 */
export async function pollUntilVerified<
  T extends { verified: boolean; registeredToOther?: boolean },
>(check: () => Promise<T>, options: VerifyPollOptions = {}): Promise<T> {
  const { signal } = options
  const pollIntervalMs = options.pollIntervalMs ?? VERIFY_POLL_INTERVAL_MS
  const deadline =
    Date.now() + (options.graceWindowMs ?? VERIFY_GRACE_WINDOW_MS)

  let result = await check()

  if (
    !result.verified &&
    !result.registeredToOther &&
    options.isDefinitivelyDead
  ) {
    try {
      // Race the oracle against one poll interval (or CANCEL): it exists to
      // SHORTEN the grace window, so a hung status endpoint must degrade to
      // the blind poll rather than stall verification past the window — a
      // browser fetch can otherwise block for minutes.
      const oracleBudgetMs = Math.max(
        0,
        Math.min(pollIntervalMs, deadline - Date.now()),
      )
      const dead = await Promise.race([
        options.isDefinitivelyDead(),
        sleepUnlessAborted(oracleBudgetMs, signal).then(() => false),
      ])
      if (dead) return result
    } catch {
      // Inconclusive — an unreachable oracle must never fail a verification
      // the chain could still confirm.
    }
  }

  // A name registered to someone else will not become ours by waiting, so a
  // lost race ends the poll as conclusively as a verified one.
  while (!result.verified && !result.registeredToOther && !signal?.aborted) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) break

    await sleepUnlessAborted(Math.min(pollIntervalMs, remaining), signal)
    if (signal?.aborted) break

    result = await check()
  }

  return result
}

/**
 * Verify OUR registration landed on-chain. Used as a fallback after the
 * submit/poll path fails, and as the resume anchor for a run that was
 * interrupted after the register call went out.
 *
 * Owner and resolver are caller-supplied `register` args, so matching them
 * proves nothing on their own; `commitmentAt == 0` is what proves our own
 * reveal executed. See `verifyHcaRegistrationActor` — same check, EOA
 * deployment.
 */
export function verifyRegistrationActor(
  input: {
    name: string
    owner: Address
    resolverAddress: Address
    publicClient: PublicClient
    /** The commitment this flow's registration consumed. */
    commitment: Hex
    /** Override for the standalone-HCA registrar; defaults to the EOA deployment. */
    registrarAddress?: Address
  } & VerifyPollOptions,
): ResultAsync<
  {
    verified: boolean
    registeredToOther: boolean
    isUnregistered: boolean
    reason?: string
  },
  Error
> {
  const registrarAddress =
    input.registrarAddress ??
    getChainContractAddress({
      chain: requireEnsChain(input.publicClient, 'registration'),
      contract: 'ensEthRegistrar',
    })
  const cleanName = input.name.replace('.eth', '')

  const readRegistryEntry = async (): Promise<{
    verified: boolean
    registeredToOther: boolean
    isUnregistered: boolean
    reason?: string
  }> => {
    // ETHRegistrar.REGISTRY() points at the IPermissionedRegistry where
    // entries are stored. Read the registry, then look up the resolver.
    const registryAddress = (await readContract(input.publicClient, {
      address: registrarAddress,
      abi: parseAbi(['function REGISTRY() view returns (address)']),
      functionName: 'REGISTRY',
    })) as Address

    // ensjs-abi ships no owner-by-label snippet, so that one stays local.
    const registryOwnerAbi = parseAbi([
      'function getOwner(string label) view returns (address)',
    ])
    const [[resolver, owner, subregistry], commitTime] = await Promise.all([
      multicall(input.publicClient, {
        allowFailure: false,
        contracts: [
          {
            address: registryAddress,
            abi: permissionedRegistryGetResolverSnippet,
            functionName: 'getResolver',
            args: [cleanName],
          },
          {
            address: registryAddress,
            abi: registryOwnerAbi,
            functionName: 'getOwner',
            args: [cleanName],
          },
          {
            address: registryAddress,
            abi: permissionedRegistryGetSubregistrySnippet,
            functionName: 'getSubregistry',
            args: [cleanName],
          },
        ],
      }),
      readContract(input.publicClient, {
        address: registrarAddress,
        abi: ethRegistrarCommitmentsSnippet,
        functionName: 'commitmentAt',
        args: [input.commitment],
      }),
    ])

    // Lost the race: the label is owned, but by someone else. Distinct from
    // "not registered yet" — no retry can win it back, so the caller must stop
    // rather than resubmit.
    const registeredToOther =
      !isAddressEqual(owner, zeroAddress) && !isAddressEqual(owner, input.owner)

    // Nobody holds the label: the register never landed, so every `reason`
    // below can only restate that. Callers then keep the failure that
    // stopped it instead.
    const isUnregistered = isAddressEqual(owner, zeroAddress)

    if (
      isAddressEqual(resolver, zeroAddress) ||
      !isAddressEqual(resolver, input.resolverAddress)
    ) {
      return {
        verified: false,
        registeredToOther,
        isUnregistered,
        reason: `resolver is ${resolver}, expected ${input.resolverAddress}`,
      }
    }
    if (
      isAddressEqual(owner, zeroAddress) ||
      !isAddressEqual(owner, input.owner)
    ) {
      return {
        verified: false,
        registeredToOther,
        isUnregistered,
        reason: `owner is ${owner}, expected ${input.owner}`,
      }
    }
    // We set none, and whoever did owns every name beneath this one.
    if (!isAddressEqual(subregistry, zeroAddress)) {
      return {
        verified: false,
        registeredToOther,
        isUnregistered,
        reason: `subregistry is ${subregistry}, expected none — this registration is not ours`,
      }
    }
    if (BigInt(commitTime) !== 0n) {
      return {
        verified: false,
        registeredToOther,
        isUnregistered,
        reason: `our commitment is unconsumed (recorded at ${commitTime}), so a different reveal registered this name`,
      }
    }

    return { verified: true, registeredToOther: false, isUnregistered: false }
  }

  return fromPromise(pollUntilVerified(readRegistryEntry, input), (error) =>
    error instanceof Error ? error : new Error(String(error)),
  )
}

/**
 * Confirm the commitment is recorded on-chain, and work out when it becomes
 * old enough to reveal.
 *
 * It does not wait for that moment itself: `commitmentCooldown` does, off the
 * returned `registerReadyTimestamp`, which is what both apps render as the
 * countdown. Waiting here instead left a resumed run showing "validating
 * commitment" for the whole cooldown and then skipping the countdown.
 */
export function validateCommitmentActor(input: {
  commitment: CommitmentData
  publicClient: PublicClient
  /** Override for the standalone-HCA registrar; defaults to the EOA deployment. */
  registrarAddress?: Address
}): ResultAsync<{ registerReadyTimestamp: number }, Error> {
  const registrarAddress =
    input.registrarAddress ??
    getChainContractAddress({
      chain: requireEnsChain(input.publicClient, 'registration'),
      contract: 'ensEthRegistrar',
    })

  return fromPromise(
    (async () => {
      console.log('🔍 [REGISTRATION ACTOR] Validating commitment readiness...')

      // Helper function to sleep
      const sleep = (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms))

      // Check MIN_COMMITMENT_AGE from contract
      let minAge: bigint
      try {
        minAge = await readContract(input.publicClient, {
          address: registrarAddress,
          abi: ethRegistrarMinCommitmentAgeSnippet,
          functionName: 'MIN_COMMITMENT_AGE',
        })
        console.log(
          `📋 [REGISTRATION ACTOR] MIN_COMMITMENT_AGE: ${minAge.toString()} seconds`,
        )
      } catch (error) {
        console.warn(
          '⚠️ [REGISTRATION ACTOR] Failed to fetch MIN_COMMITMENT_AGE, assuming 0:',
          error,
        )
        minAge = 0n
      }

      // Check if commitmentAt is recorded (retry with backoff if not)
      let committedAt: bigint = 0n
      let attempts = 0
      const maxAttempts = 5

      while (committedAt === 0n && attempts < maxAttempts) {
        try {
          committedAt = await readContract(input.publicClient, {
            address: registrarAddress,
            abi: ethRegistrarCommitmentsSnippet,
            functionName: 'commitmentAt',
            args: [input.commitment.commitment],
          })

          if (committedAt === 0n) {
            attempts++
            if (attempts < maxAttempts) {
              console.log(
                `⏳ [REGISTRATION ACTOR] Commitment timestamp not yet recorded, waiting 3s (attempt ${attempts}/${maxAttempts})...`,
              )
              await sleep(3000)
            }
          }
        } catch (error) {
          console.warn(
            '⚠️ [REGISTRATION ACTOR] Failed to fetch commitmentAt:',
            error,
          )
          attempts++
          if (attempts < maxAttempts) {
            await sleep(3000)
          }
        }
      }

      if (committedAt === 0n) {
        throw new Error(
          'Commitment timestamp not recorded after multiple attempts. The commitment transaction may not have been confirmed yet.',
        )
      }

      console.log(
        `✅ [REGISTRATION ACTOR] Commitment recorded at timestamp: ${committedAt.toString()}`,
      )

      if (minAge === 0n) {
        console.log(
          '✅ [REGISTRATION ACTOR] MIN_COMMITMENT_AGE is 0, commitment is ready',
        )
        return { registerReadyTimestamp: Date.now() }
      }

      // Measured in chain time, since `commitmentAt` is a block timestamp, and
      // handed back as a wall-clock deadline for the cooldown to wait on.
      const latestBlock = await getBlock(input.publicClient)
      const elapsed = (latestBlock.timestamp as bigint) - committedAt
      const remainingSeconds = elapsed < minAge ? Number(minAge - elapsed) : 0

      console.log(
        `✅ [REGISTRATION ACTOR] Commitment is ${elapsed.toString()}s old (${minAge.toString()}s required); ready in ${remainingSeconds}s`,
      )
      return { registerReadyTimestamp: Date.now() + remainingSeconds * 1000 }
    })(),
    (error) => {
      console.error(
        '❌ [REGISTRATION ACTOR] Commitment validation failed:',
        error,
      )
      return error as Error
    },
  )
}

/**
 * Submit token approval transaction via transaction manager
 * Note: Normalizes token address to lowercase for Rhinestone SDK compatibility
 */
export function submitApprovalActor(input: {
  tokenPrice: bigint
  selectedToken: TOKEN_SYMBOL
  signer: import('../..').Signer
  publicClient: PublicClient
  id?: string
  /** Spender to approve. Defaults to the legacy registrar. */
  registrarAddress?: Address
  /** Token to approve. Defaults to the legacy mock token for the symbol. */
  paymentTokenAddress?: Address
}): ResultAsync<string, Error> {
  const registrarAddress =
    input.registrarAddress ??
    getChainContractAddress({
      chain: requireEnsChain(input.publicClient, 'registration'),
      contract: 'ensEthRegistrar',
    })

  return ResultAsync.fromPromise(
    Promise.resolve().then(() => {
      const accountAddress = getSignerAddress(input.signer)

      const tokenAddress =
        input.paymentTokenAddress ??
        getPaymentTokenAddress(
          input.selectedToken,
          requireEnsChain(input.publicClient, 'registration'),
        )
      // Normalize to lowercase to avoid Rhinestone SDK validation issues
      const normalizedTokenAddress = tokenAddress.toLowerCase() as Address
      console.log(
        `🔧 Token address normalization: ${tokenAddress} -> ${normalizedTokenAddress}`,
      )

      // Approve only what this registration needs, never an unlimited allowance.
      const approvalData = encodeTokenApprovalData(
        registrarAddress,
        authorizedPaymentAmount(input.tokenPrice),
      )

      const request = createTransactionRequest({
        signer: input.signer,
        from: accountAddress,
        chainId: requireChainId(input.publicClient, 'registration'),
        calls: [
          {
            to: normalizedTokenAddress,
            data: approvalData,
            value: 0n,
          },
        ],
      })

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request,
        },
        input.signer,
        {
          id: input.id,
          description: `Approve ${input.selectedToken} for registration`,
          publicClient: input.publicClient,
          timeout: 120_000,
        },
      )

      return txId
    }),
    (error) => new Error(`Failed to submit approval: ${error}`),
  )
}

/**
 * Submit registration transaction via transaction manager
 * Note: Normalizes payment token address to lowercase for Rhinestone SDK compatibility
 */
export function submitRegistrationActor(input: {
  name: string
  commitment: CommitmentData
  signer: import('../..').Signer
  duration: bigint
  selectedToken: TOKEN_SYMBOL
  owner: Address
  publicClient: PublicClient
  resolverAddress: Address
  id?: string
}): ResultAsync<string, Error> {
  const registrarAddress = getChainContractAddress({
    chain: requireEnsChain(input.publicClient, 'registration'),
    contract: 'ensEthRegistrar',
  })

  return fromPromise(
    (async () => {
      const accountAddress = getSignerAddress(input.signer)

      const paymentToken = getPaymentTokenAddress(
        input.selectedToken,
        requireEnsChain(input.publicClient, 'registration'),
      )
      // Normalize to lowercase to avoid Rhinestone SDK validation issues
      const normalizedPaymentToken = paymentToken.toLowerCase() as Address
      console.log(
        `🔧 Payment token normalization: ${paymentToken} -> ${normalizedPaymentToken}`,
      )

      // Validate the token against the registrar's *actual* rent price oracle
      // (see `assertPaymentTokenSupported` for why the registrar itself can't
      // be queried directly).
      await assertPaymentTokenSupported(
        input.publicClient,
        registrarAddress,
        normalizedPaymentToken,
      )

      const registerCall = encodeRegisterCall({
        name: input.name,
        owner: input.owner,
        secret: input.commitment.secret,
        duration: input.duration,
        registrarAddress,
        paymentToken: normalizedPaymentToken,
        resolverAddress: input.resolverAddress,
      })

      const request = createTransactionRequest({
        signer: input.signer,
        from: accountAddress,
        chainId: requireChainId(input.publicClient, 'registration'),
        calls: [registerCall],
      })

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request,
        },
        input.signer,
        {
          id: input.id,
          description: `Register ${input.name}.eth`,
          publicClient: input.publicClient,
          timeout: 120_000,
        },
      )

      return txId
    })(),
    (error) => error as Error,
  )
}

/**
 * Poll transaction status by subscribing to transaction machine
 */
export function pollTransactionStatusActor(input: {
  txId: string
}): ResultAsync<void, Error> {
  const txActor = transactionManager.getTransaction(input.txId)

  if (!txActor) {
    return errAsync(new Error(`Transaction ${input.txId} not found`))
  }

  const read: ReadOutcome<void> = (snapshot) => {
    console.log('🔍 [POLL TX STATUS] Transaction state:', {
      txId: input.txId,
      state: snapshot.value,
      hasError: !!snapshot.context.error,
      error: snapshot.context.error?.message,
    })

    if (isSuccessSnapshot(snapshot)) {
      console.log('✅ [POLL TX STATUS] Transaction succeeded')
      return { settled: true, value: undefined }
    }
    // Any error state (handles nested states like error.submission, error.reverted, etc.)
    if (isErrorSnapshot(snapshot)) {
      console.error('❌ [POLL TX STATUS] Transaction failed:', {
        errorState: snapshot.value,
        error: snapshot.context.error,
      })
      return {
        settled: false,
        error: snapshot.context.error || new Error('Transaction failed'),
      }
    }
    return undefined
  }

  return fromPromise(
    awaitTransactionOutcome(input.txId, txActor, read),
    (error) => error as Error,
  )
}

// ============================================================================
// Renewal Actor Functions
// ============================================================================
//
// `ETHRegistrar.renew((label, duration, referrer), paymentToken)` pulls the rent
// from `_msgSender()` (see AbstractETHRegistrar.renew). Crucially, the registrar
// uses HCA-aware sender resolution: when an HCA calls `renew`, `_msgSender()`
// unwraps to the HCA's owner EOA (HCAEquivalence). So the registrar always pulls
// payment from the EOA — never the HCA, which holds no tokens.
//
// This is the same payer the `register` flow authorizes, so renewal reuses the
// exact allowance machinery: read `allowance[EOA][registrar]`, and either skip
// (already enough), sign a gasless EIP-2612 permit batched with `renew` in one
// intent (rhinestone/HCA), or do a plain on-chain `approve` (EOA).

/**
 * Encode `renew(RenewData, paymentToken)` calldata, where
 * `RenewData = (label, duration, referrer)`. Both renewers dropped the flat
 * `renew(string,uint64,address,bytes32)`; that selector now reverts empty.
 */
function encodeRenewData(
  label: string,
  duration: bigint,
  paymentToken: Address,
): Hash {
  const cleanLabel = label.replace('.eth', '')
  return encodeFunctionData({
    abi: ethRegistrarRenewSnippet,
    functionName: 'renew',
    args: [{ label: cleanLabel, duration, referrer: zeroHash }, paymentToken],
  })
}

/**
 * Submit a standalone `renew` transaction. Used on the pure-EOA path, where the
 * allowance is set by a preceding on-chain `approve` (or already sufficient).
 * The renewal payer is the EOA — both because the EOA is `msg.sender` here and
 * because the registrar's HCA-aware `_msgSender()` resolves to the EOA anyway.
 */
export function submitRenewActor(input: {
  label: string
  duration: bigint
  selectedToken: TOKEN_SYMBOL
  signer: import('../..').Signer
  publicClient: PublicClient
  renewerAddress?: Address
  id?: string
}): ResultAsync<string, Error> {
  // Renewal is NOT an HCA flow — it is a plain wallet transaction against the
  // selected canonical renewer. V2 callers keep the ETHRegistrar default;
  // unmigrated V1 names explicitly target ETHRenewerV1.
  return fromPromise(
    (async () => {
      const chainId = requireChainId(input.publicClient, 'registration')
      const renewerAddress =
        input.renewerAddress ??
        getChainContractAddress({
          chain: requireEnsChain(input.publicClient, 'registration'),
          contract: 'ensEthRegistrar',
        })
      const accountAddress = getSignerAddress(input.signer)

      // The registrar only accepts its own PAYMENT_TOKEN /
      // SECONDARY_PAYMENT_TOKEN; `assertPaymentTokenSupported` below rejects
      // anything else (e.g. DAI) before we spend gas on it.
      const paymentToken = getPaymentTokenAddress(
        input.selectedToken,
        requireEnsChain(input.publicClient, 'registration'),
      )
      // Normalize to lowercase to avoid Rhinestone SDK validation issues.
      const normalizedPaymentToken = paymentToken.toLowerCase() as Address

      await assertPaymentTokenSupported(
        input.publicClient,
        renewerAddress,
        normalizedPaymentToken,
      )

      const renewData = encodeRenewData(
        input.label,
        input.duration,
        normalizedPaymentToken,
      )

      const request = createTransactionRequest({
        signer: input.signer,
        from: accountAddress,
        chainId,
        calls: [{ to: renewerAddress, data: renewData, value: 0n }],
      })

      const txId = transactionManager.startTransaction(
        { type: 'custom', request },
        input.signer,
        {
          id: input.id,
          description: `Renew ${input.label}.eth`,
          publicClient: input.publicClient,
          timeout: 120_000,
        },
      )

      return txId
    })(),
    (error) => (error instanceof Error ? error : new Error(String(error))),
  )
}
