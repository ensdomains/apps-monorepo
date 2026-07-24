/**
 * Standalone-HCA registration actors (user-paid USDC route).
 *
 * These target the STANDALONE-HCA deployment (via `@ens-apps/smart-account`'s
 * manifest) — a different contract set from `ENS_SEPOLIA_CONTRACTS`, which the
 * pure-EOA path (portal) keeps using untouched.
 *
 * Route shape (per the "HCA: New" handoff doc; NO gas sponsorship):
 *   - Commit leg (first HCA action, session-signed, one request):
 *       USDC.permit(wallet, HCA, budget)        — only when funding is needed
 *       USDC.transferFrom(wallet, HCA, budget)  — only when funding is needed
 *       HCAOwnerAndSessionValidator.enableSessionWithRefund(...) — only until enabled
 *       ETHRegistrar.commit(commitment)
 *     The same request lazily deploys the HCA. `sponsored: { gas:false,
 *     bridging:false, swaps:false }`, `feeAsset: 'USDC'` — execution costs are
 *     refunded from the HCA's USDC.
 *   - Reveal leg (after cooldown, session-signed, no wallet prompt):
 *       price re-read immediately before; exact-ordered reveal batch from
 *       `buildRevealBatch` (deployProxy? → approve(price) → register(wallet) →
 *       setters → setNameWithHCA? → authorizeNameRoles).
 */

import {
  buildCommitCall,
  buildEnableSessionWithRefundCall,
  buildRevealBatch,
  computeResolverAddress,
  estimateHcaBudget,
  getDestinationContracts,
  HCA_LEG_GAS_LIMITS,
  type Call as HcaCall,
  type HcaLeg,
  readCommitment,
  readRegisterPrice,
} from '@ens-apps/smart-account'
import type { Transaction } from '@rhinestone/sdk'
import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import type { Address, Chain, Hash, Hex, PublicClient } from 'viem'
import {
  bytesToHex,
  encodeFunctionData,
  isAddressEqual,
  keccak256,
  parseAbi,
  parseSignature,
  stringToHex,
} from 'viem'
import { getEip712Domain, readContract, signTypedData } from 'viem/actions'
import { sepolia } from 'viem/chains'
import { transactionManager } from '../../providers/transactionManager'
import type { RhinestoneSigner, Signer } from '../../types/signer.types'
import type {
  Call,
  RhinestoneTransactionRequest,
  SessionEnableData,
} from '../../types/transaction.types'
import type { PermitSignature } from './registration.actors'

type CommitmentData = {
  commitment: Hash
  secret: Hex
}

/** Session-enable payload threaded from the manager (absent once enabled). */
export interface HcaSessionEnableParams {
  readonly enableData: SessionEnableData
  readonly permissionId: Hex
  readonly sessionKey: Address
  readonly validUntil: bigint
}

const erc2612Abi = parseAbi([
  'function nonces(address owner) view returns (uint256)',
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
])

const permissionedRegistryAbi = parseAbi([
  'struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }',
  'function getState(uint256 anyId) view returns (State state)',
  'function getResolver(string label) view returns (address)',
])

/** `IPermissionedRegistry.Status.REGISTERED` */
const STATUS_REGISTERED = 2

// Comfortably covers the commitment cooldown plus relayer latency. Permits are
// single-use (nonce-bound), so a generous deadline is not a replay risk.
const PERMIT_DEADLINE_SECONDS = 60 * 60

/** The standalone-HCA registrar for a chain (for the shared cooldown spine). */
export function hcaRegistrarAddress(chainId: number): Address {
  return getDestinationContracts(chainId).ethRegistrar
}

/**
 * Read the USDC (6dp) an intent will spend, straight from a Rhinestone
 * `prepareTransaction` quote (`intentCost.tokensReceived[0].amountSpent`).
 * This is the amount the orchestrator actually pulls, so it is immune to the
 * caller's local gas-price reads. Returns `null` if the quote can't be read.
 */
async function quoteIntentSpendUsdc(
  account: RhinestoneSigner['account'],
  chain: Chain,
  calls: Call[],
  gasLimit: bigint,
  signers?: Transaction['signers'],
): Promise<bigint | null> {
  const prepared = await account.prepareTransaction({
    sourceChains: [chain],
    targetChain: chain,
    calls: [...calls],
    sponsored: { gas: false, bridging: false, swaps: false },
    feeAsset: 'USDC',
    tokenRequests: [],
    gasLimit,
    ...(signers ? { signers } : {}),
  } as Transaction)
  const received = (
    prepared as {
      intentRoute?: {
        intentCost?: { tokensReceived?: { amountSpent?: string }[] }
      }
    }
  ).intentRoute?.intentCost?.tokensReceived?.[0]?.amountSpent
  if (received === undefined) return null
  const value = BigInt(received)
  return value > 0n ? value : null
}

/**
 * Compute the same-chain HCA funding budget at runtime:
 * `commitCost + registerCost + 3%·registerCost + registrationPrice`.
 *
 * Prefers Rhinestone's per-leg quote (`prepareTransaction` → `intentCost`),
 * which reflects the exact USDC the orchestrator pulls and is immune to
 * Sepolia gas-price spikes. Falls back to a clamped gas-limit model per leg
 * when the account/session isn't available or a quote fails.
 */
export function estimateHcaBudgetActor(input: {
  name: string
  duration: bigint
  publicClient: PublicClient
  chainId: number
  signer?: Signer
  sessionEnable?: HcaSessionEnableParams
  apiKey?: string
}): ResultAsync<bigint, Error> {
  const label = cleanLabel(input.name)
  const chainId = input.chainId

  // Build a best-effort per-leg quoter when we have a Rhinestone signer with an
  // active session (needed to shape the session-signed intents).
  const rhinestone =
    input.signer?.type === 'rhinestone' ? input.signer : undefined
  const chain = input.publicClient.chain
  const activeSession = rhinestone?.session

  const quoteLegCostUsdc =
    rhinestone && activeSession && chain
      ? async (leg: HcaLeg): Promise<bigint | null> => {
          const hca = rhinestone.account.getAddress() as Address
          const resolver = computeResolverAddress({ chainId, hca })
          const baseSigners: Transaction['signers'] = {
            type: 'experimental_session',
            session: activeSession.session,
            verifyExecutions: true,
          }
          if (leg === 'commit') {
            // Quote the SAME shape `submitFundingAndCommitActor` submits: when
            // the session still needs enabling, the commit intent carries
            // `enableData` (first-use mode 05) AND an `enableSessionWithRefund`
            // call — both materially change the gas. The funding
            // permit/transferFrom pair is two cheap ERC-20 calls on top; the
            // `HCA_LEG_GAS_LIMITS.commit` bound (a proven upper bound over the
            // measured ~393k first-commit fill, which the rail prices the quote
            // on) covers them, so a successful quote never underfunds the HCA.
            const commitSigners: Transaction['signers'] = input.sessionEnable
              ? { ...baseSigners, enableData: input.sessionEnable.enableData }
              : baseSigners
            const calls: Call[] = []
            if (input.sessionEnable) {
              const enableCall = buildEnableSessionWithRefundCall({
                chainId,
                permissionId: input.sessionEnable.permissionId,
                sessionKey: input.sessionEnable.sessionKey,
                validUntil: input.sessionEnable.validUntil,
                resolver,
              })
              calls.push({
                to: enableCall.to,
                value: enableCall.value,
                data: enableCall.data,
              })
            }
            const commitCall = buildCommitCall({
              chainId,
              commitment: `0x${'11'.repeat(32)}` as Hex,
            })
            calls.push({
              to: commitCall.to,
              value: commitCall.value,
              data: commitCall.data,
            })
            return quoteIntentSpendUsdc(
              rhinestone.account,
              chain,
              calls,
              HCA_LEG_GAS_LIMITS.commit,
              commitSigners,
            )
          }
          // register leg: full reveal batch at the current price (the session
          // is enabled by the commit, so no enableData here).
          const price = await readRegisterPrice({
            publicClient: input.publicClient,
            chainId,
            label,
            duration: input.duration,
          })
          const resolverCode = await input.publicClient.getCode({
            address: resolver,
          })
          const revealCalls = buildRevealBatch({
            chainId,
            hca,
            resolver,
            resolverDeployed: Boolean(resolverCode && resolverCode !== '0x'),
            label,
            // The name recipient (wallet). A placeholder is fine for a gas/cost
            // quote — the orchestrator prices the intent by size, not by owner.
            wallet: hca,
            secret: `0x${'22'.repeat(32)}` as Hex,
            price,
            duration: input.duration,
          })
          return quoteIntentSpendUsdc(
            rhinestone.account,
            chain,
            toCalls(revealCalls),
            HCA_LEG_GAS_LIMITS.register,
            baseSigners,
          )
        }
      : undefined

  return fromPromise(
    estimateHcaBudget({
      publicClient: input.publicClient,
      chainId,
      label,
      duration: input.duration,
      ...(input.apiKey ? { apiKey: input.apiKey } : {}),
      ...(quoteLegCostUsdc ? { quoteLegCostUsdc } : {}),
    }).then((b) => b.total),
    (error) => (error instanceof Error ? error : new Error(String(error))),
  )
}

const toCalls = (calls: readonly HcaCall[]): Call[] =>
  calls.map((c) => ({ to: c.to, data: c.data, value: c.value }))

const cleanLabel = (name: string): string => name.replace(/\.eth$/, '')

/** User-paid request shape shared by both legs. */
function buildUserPaidRequest(params: {
  from: Address
  chainId: number
  calls: Call[]
  sessionEnableData?: SessionEnableData
}): RhinestoneTransactionRequest {
  return {
    type: 'rhinestone-intent',
    from: params.from,
    chainId: params.chainId,
    rhinestoneParams: {
      calls: params.calls,
      sponsored: { gas: false, bridging: false, swaps: false },
      feeAsset: 'USDC',
      ...(params.sessionEnableData
        ? { sessionEnableData: params.sessionEnableData }
        : {}),
    },
  }
}

/**
 * Read the HCA's USDC balance (standalone-deployment USDC). Used to skip the
 * funding permit when the HCA already holds enough from a prior registration.
 */
export function readHcaUsdcBalanceActor(input: {
  hca: Address
  publicClient: PublicClient
  chainId: number
}): ResultAsync<bigint, Error> {
  const contracts = getDestinationContracts(input.chainId)
  return fromPromise(
    readContract(input.publicClient, {
      address: contracts.usdc,
      abi: erc2612Abi,
      functionName: 'balanceOf',
      args: [input.hca],
    }),
    (error) => (error instanceof Error ? error : new Error(String(error))),
  )
}

/**
 * Sign the HCA funding permit — the SECOND (and last) wallet prompt:
 * EIP-2612 permit with `owner = wallet`, `spender = HCA`, `value = budget`.
 *
 * NOT a registrar allowance: the registrar is paid by the HCA itself inside
 * the reveal batch (`approve(price)` from the HCA's own balance).
 */
export function signFundingPermitActor(input: {
  wallet: Address
  hca: Address
  value: bigint
  approvalSigner: Signer
  publicClient: PublicClient
  chainId: number
}): ResultAsync<PermitSignature, Error> {
  if (input.approvalSigner.type !== 'eoa') {
    return errAsync(
      new Error('Funding permit requires an EOA signer (the wallet).'),
    )
  }
  const walletClient = input.approvalSigner.walletClient
  const account = walletClient.account
  if (!account) {
    return errAsync(new Error('EOA wallet client has no account connected'))
  }
  if (!isAddressEqual(account.address, input.wallet)) {
    return errAsync(
      new Error(
        `Permit signer ${account.address} does not match the wallet ${input.wallet}`,
      ),
    )
  }

  const contracts = getDestinationContracts(input.chainId)

  return fromPromise(
    (async () => {
      const nonce = await readContract(input.publicClient, {
        address: contracts.usdc,
        abi: erc2612Abi,
        functionName: 'nonces',
        args: [input.wallet],
      })

      // Prefer ERC-5267 `eip712Domain()`; fall back to `name()` + `version()`.
      // Circle's Sepolia USDC (FiatTokenV2_2) does NOT implement ERC-5267 (it
      // reverts), and its EIP-712 domain version is "2" — so the fallback MUST
      // read the token's `version()` getter, not assume "1", or the permit
      // signature is computed over the wrong domain and reverts with
      // `EIP2612: invalid signature`.
      let domain: {
        name: string
        version: string
        chainId: number
        verifyingContract: Address
      }
      try {
        const resolved = await getEip712Domain(input.publicClient, {
          address: contracts.usdc,
        })
        domain = {
          name: resolved.domain.name ?? '',
          version: resolved.domain.version ?? '1',
          chainId: Number(resolved.domain.chainId ?? input.chainId),
          verifyingContract:
            (resolved.domain.verifyingContract as Address) ?? contracts.usdc,
        }
      } catch {
        const [name, version] = await Promise.all([
          readContract(input.publicClient, {
            address: contracts.usdc,
            abi: erc2612Abi,
            functionName: 'name',
          }),
          // `version()` is optional on ERC-2612 tokens; default to "1" only
          // when the token doesn't expose it.
          readContract(input.publicClient, {
            address: contracts.usdc,
            abi: erc2612Abi,
            functionName: 'version',
          }).catch(() => '1'),
        ])
        domain = {
          name,
          version,
          chainId: input.chainId,
          verifyingContract: contracts.usdc,
        }
      }

      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECONDS,
      )

      const signature = await signTypedData(walletClient, {
        account,
        domain,
        types: {
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        message: {
          owner: input.wallet,
          spender: input.hca,
          value: input.value,
          nonce,
          deadline,
        },
      })

      const { r, s, v, yParity } = parseSignature(signature)

      return {
        owner: input.wallet,
        spender: input.hca,
        value: input.value,
        deadline,
        v: Number(v ?? BigInt(yParity + 27)),
        r,
        s,
      } satisfies PermitSignature
    })(),
    (error) => (error instanceof Error ? error : new Error(String(error))),
  )
}

/**
 * Commit leg: fund the HCA (when needed), enable the session (when needed),
 * and submit the commitment — ONE session-signed, user-paid request. Deploys
 * the HCA lazily when absent. Generates the secret + commitment here so the
 * reveal binds to the exact same inputs.
 */
export function submitFundingAndCommitActor(input: {
  name: string
  wallet: Address
  hca: Address
  duration: bigint
  permit?: PermitSignature
  sessionEnable?: HcaSessionEnableParams
  signer: Signer
  publicClient: PublicClient
  id?: string
}): ResultAsync<
  { txId: string; resolverAddress: Address; commitment: CommitmentData },
  Error
> {
  return fromPromise(
    (async () => {
      const chainId = input.publicClient.chain?.id ?? sepolia.id
      const contracts = getDestinationContracts(chainId)
      const label = cleanLabel(input.name)

      const resolverAddress = computeResolverAddress({
        chainId,
        hca: input.hca,
      })

      // Fresh secret per attempt; the commitment binds label/wallet/secret/
      // resolver/duration — the reveal must reuse ALL of them.
      const secret = bytesToHex(
        crypto.getRandomValues(new Uint8Array(32)),
      ) as Hex
      const commitment = await readCommitment({
        publicClient: input.publicClient,
        chainId,
        label,
        wallet: input.wallet,
        secret,
        resolver: resolverAddress,
        duration: input.duration,
      })

      const calls: Call[] = []

      // Funding pair — only when the HCA balance did not cover the budget.
      if (input.permit) {
        calls.push({
          to: contracts.usdc,
          value: 0n,
          data: encodeFunctionData({
            abi: erc2612Abi,
            functionName: 'permit',
            args: [
              input.permit.owner,
              input.permit.spender,
              input.permit.value,
              input.permit.deadline,
              input.permit.v,
              input.permit.r,
              input.permit.s,
            ],
          }),
        })
        calls.push({
          to: contracts.usdc,
          value: 0n,
          data: encodeFunctionData({
            abi: erc2612Abi,
            functionName: 'transferFrom',
            args: [input.permit.owner, input.hca, input.permit.value],
          }),
        })
      }

      // Session enablement — only until the on-chain enable lands.
      if (input.sessionEnable) {
        const enableCall = buildEnableSessionWithRefundCall({
          chainId,
          permissionId: input.sessionEnable.permissionId,
          sessionKey: input.sessionEnable.sessionKey,
          validUntil: input.sessionEnable.validUntil,
          resolver: resolverAddress,
        })
        calls.push({
          to: enableCall.to,
          value: enableCall.value,
          data: enableCall.data,
        })
      }

      const commitCall = buildCommitCall({
        chainId,
        commitment,
      })
      calls.push({
        to: commitCall.to,
        value: commitCall.value,
        data: commitCall.data,
      })

      const request = buildUserPaidRequest({
        from: input.hca,
        chainId,
        calls,
        sessionEnableData: input.sessionEnable?.enableData,
      })

      const txId = transactionManager.startTransaction(
        { type: 'custom', request },
        input.signer,
        {
          id: input.id,
          description: `Set up registration for ${label}.eth`,
          publicClient: input.publicClient,
          timeout: 120_000,
        },
      )

      return {
        txId,
        resolverAddress,
        commitment: { commitment, secret },
      }
    })(),
    (error) => (error instanceof Error ? error : new Error(String(error))),
  )
}

/**
 * Verify a standalone-HCA registration on the NEW registry: the label must be
 * REGISTERED, `latestOwner` must be the WALLET (the registrar always assigns
 * the name to the wallet, never the HCA), and the registry resolver must be
 * the HCA's PermissionedResolver proxy.
 */
export function verifyHcaRegistrationActor(input: {
  name: string
  wallet: Address
  hca: Address
  publicClient: PublicClient
}): ResultAsync<{ verified: boolean }, Error> {
  return fromPromise(
    (async () => {
      const chainId = input.publicClient.chain?.id ?? sepolia.id
      const contracts = getDestinationContracts(chainId)
      const label = cleanLabel(input.name)
      const expectedResolver = computeResolverAddress({
        chainId,
        hca: input.hca,
      })

      const [state, registryResolver] = await Promise.all([
        readContract(input.publicClient, {
          address: contracts.ethRegistry,
          abi: permissionedRegistryAbi,
          functionName: 'getState',
          args: [BigInt(keccak256(stringToHex(label)))],
        }),
        readContract(input.publicClient, {
          address: contracts.ethRegistry,
          abi: permissionedRegistryAbi,
          functionName: 'getResolver',
          args: [label],
        }),
      ])

      const verified =
        Number(state.status) === STATUS_REGISTERED &&
        isAddressEqual(state.latestOwner, input.wallet) &&
        isAddressEqual(registryResolver, expectedResolver)

      return { verified }
    })(),
    (error) => (error instanceof Error ? error : new Error(String(error))),
  )
}

/**
 * Reveal leg: re-read the CURRENT price, then submit the exact-ordered reveal
 * batch session-signed (no wallet prompt, no enable data — the session was
 * enabled by the commit leg).
 */
export function submitRevealBatchActor(input: {
  name: string
  wallet: Address
  hca: Address
  duration: bigint
  secret: Hex
  signer: Signer
  publicClient: PublicClient
  primaryName?: string
  id?: string
}): ResultAsync<string, Error> {
  return fromPromise(
    (async () => {
      const chainId = input.publicClient.chain?.id ?? sepolia.id
      const label = cleanLabel(input.name)

      const resolverAddress = computeResolverAddress({
        chainId,
        hca: input.hca,
      })

      // Price MUST be read immediately before the reveal, never cached.
      const price = await readRegisterPrice({
        publicClient: input.publicClient,
        chainId,
        label,
        duration: input.duration,
      })

      const resolverCode = await input.publicClient.getCode({
        address: resolverAddress,
      })
      const resolverDeployed = Boolean(resolverCode && resolverCode !== '0x')

      const revealCalls = buildRevealBatch({
        chainId,
        hca: input.hca,
        resolver: resolverAddress,
        resolverDeployed,
        label,
        wallet: input.wallet,
        secret: input.secret,
        price,
        duration: input.duration,
        ...(input.primaryName ? { setPrimaryName: input.primaryName } : {}),
      })

      const request = buildUserPaidRequest({
        from: input.hca,
        chainId,
        calls: toCalls(revealCalls),
      })

      const txId = transactionManager.startTransaction(
        { type: 'custom', request },
        input.signer,
        {
          id: input.id,
          description: `Register ${label}.eth`,
          publicClient: input.publicClient,
          timeout: 120_000,
        },
      )

      return txId
    })(),
    (error) => (error instanceof Error ? error : new Error(String(error))),
  )
}
