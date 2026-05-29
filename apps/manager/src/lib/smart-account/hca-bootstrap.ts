/**
 * HCA bootstrap — single-Intent, sponsored HCA proxy deployment.
 *
 * Replaces the old `hca-registry.ts` flow, which submitted a sponsored
 * Rhinestone Intent calling `HCAFactory.setAccountOwner(SCA, EOA)` from
 * the SCA. That function never existed on the real `HCAFactory.sol`
 * (`ensdomains/contracts-v2`) — it only existed on the legacy
 * `MockHCAFactoryBasic` the manager was originally wired against. The
 * real factory writes `_hcaOwners[hca] = eoa` atomically inside
 * `createAccount(initData)`, derives the HCA address deterministically
 * from the EOA via CREATE3, and rejects any (hca, owner) pair that
 * doesn't satisfy `ProxyLib.predictProxyAddress(owner) == hca`. So the
 * Rhinestone-derived SCA address can never be HCA-equivalent — only the
 * factory's CREATE3 proxy at `computeAccountAddress(eoa)` can.
 *
 * The bootstrap is therefore:
 *
 *   - one read (`accountHCAOf(eoa)`) for idempotency,
 *   - one sponsored Rhinestone Intent that calls
 *     `HCAFactory.createAccount(initData)` with the **EOA** as the
 *     Intent sender,
 *   - one orchestrator fill-poll to confirm execution before downstream
 *     code (`RhinestoneAccount` construction with `initData: { address }`)
 *     tries to use the new proxy.
 *
 * Why an EOA-mode Intent rather than a plain `walletClient.writeContract`:
 * with `account: { type: 'eoa' }` the SDK signs the Intent's origin
 * payload via `eoa.signTypedData(...)` and lets a Warp relayer pay gas
 * for the actual `createAccount` call. From the user's perspective this
 * is a single EIP-712 signature prompt and no native ETH spent — the
 * same UX as the previous (broken) `setAccountOwner` flow had. Plain
 * `writeContract` would produce a visible `eth_sendTransaction` prompt
 * and require Sepolia ETH on the EOA, which we don't guarantee.
 *
 * Para embedded MPC users have no wagmi connector and would hit
 * `ConnectorNotConnectedError` if we routed through `@wagmi/core`;
 * routing through the SDK's EOA-mode path sidesteps that entirely
 * because the SDK takes a viem `Account` directly (the same one we
 * already built via `createParaAccount` + `wrapParaAccount`).
 *
 * `initData` shape: the deployed `IHCAInitDataParser` at
 * `factory.initDataParser()` is the **ENSValidator** module from
 * `@rhinestone/module-sdk` (verified by selector — it exposes
 * `getOwnerFromInitData(bytes) -> address` *and* the full ERC-7579
 * validator surface). Its `initData` ABI is
 *
 *     abi.encode(uint256 threshold, (address owner, uint48 expiration)[] owners, address[] guardians)
 *
 * The parser also rejects `expiration == 0` with a custom revert
 * (`0x30116425`). For v0 we use `uint48.max` as a sentinel
 * "no practical expiry" — that's roughly the year 8 924 162 AD; we'll
 * tighten it when the product story for time-bound ownership lands.
 *
 * @see ../hca-factory.abi.ts — `HCA_FACTORY_ABI`
 * @see https://github.com/ensdomains/contracts-v2/blob/main/contracts/src/hca/HCAFactory.sol
 */

import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { RhinestoneSDK } from '@rhinestone/sdk'
import { errAsync, fromPromise, okAsync, type ResultAsync } from 'neverthrow'
import {
  type Account,
  type Address,
  type Chain,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { readContract } from 'viem/actions'
import { HCA_FACTORY_ABI } from '../hca-factory.abi'

/**
 * `uint48` max — sentinel for "owner never expires" in the ENSValidator
 * config. Passing `expiration == 0` reverts at the parser with selector
 * `0x30116425`. Anything else is a real future timestamp the validator
 * enforces.
 *
 * Typed as `number` (not `bigint`) because viem narrows `uint48` to JS
 * `number` in its ABI-derived param types — `2**48 - 1 = 281_474_976_710_655`
 * is safely below `Number.MAX_SAFE_INTEGER = 2**53 - 1`, so there's no
 * loss-of-precision risk here.
 */
const UINT48_MAX = 281_474_976_710_655 as const

/**
 * Tagged error for HCA bootstrap failures. Internal to this module;
 * consumers narrow via `result.error.reason`.
 */
export class HCABootstrapError extends TaggedError('HCABootstrapError')<{
  reason:
    | 'already-deployed-for-different-owner'
    | 'precheck-read-failed'
    | 'create-account-failed'
    | 'receipt-wait-failed'
    | 'post-deploy-state-mismatch'
  cause?: unknown
}> {}

/**
 * Result of a successful bootstrap.
 */
export interface HCABootstrapResult {
  /** The HCA proxy address — `factory.computeAccountAddress(eoa)`. */
  readonly hcaAddress: Address
  /**
   * Whether `createAccount` was actually called in this bootstrap (true)
   * or whether the proxy was already on-chain (false). Useful for
   * driving "first-time setup" UX without re-toasting on every page
   * load.
   */
  readonly wasDeployedInThisCall: boolean
  /** Tx hash of the `createAccount` call, if one was sent. */
  readonly hash?: Hex
}

/**
 * Caller-supplied inputs.
 *
 *   - `ownerAccount` — the viem `Account` (e.g. produced by
 *     `walletClientToAccount` for wagmi wallets, or
 *     `wrapParaAccount(createParaAccount(...))` for Para) that signs
 *     the Intent's EIP-712 origin payload. Same account the caller
 *     hands to `sdk.createAccount` for the SCA itself.
 *   - `eoaAddress` — the underlying EOA. Used as the `args[0]` of the
 *     ENSValidator `initData` tuple and as the address bootstrap reads
 *     `accountHCAOf` against.
 *   - `chain` — the chain the Intent targets. Must match the chain the
 *     SCA will run on (`customSepolia` in the manager).
 *   - `publicClient` — read-only RPC client. Used for the idempotency
 *     precheck (`accountHCAOf`), the address prediction
 *     (`computeAccountAddress`), and the post-fill ownership check
 *     (`getAccountOwner`).
 *   - `sdk` — SDK config knobs we pass through to a fresh
 *     `RhinestoneSDK` instance configured in EOA mode. We construct
 *     our own SDK rather than reusing the SCA-mode one because the
 *     SCA-mode SDK has `account.type !== 'eoa'` and would route the
 *     Intent through the SCA address instead of the EOA.
 */
export interface BootstrapHCAParams {
  readonly eoaAddress: Address
  readonly ownerAccount: Account
  readonly chain: Chain
  readonly publicClient: PublicClient
  readonly sdk: {
    readonly rhinestoneApiKey: string
    readonly pimlicoApiKey?: string
    readonly rhinestoneEndpointUrl?: string
    readonly rhinestoneCustomRpcUrls?: Record<number, string>
  }
}

/**
 * Encode the ENSValidator-flavored `initData` for `createAccount`.
 *
 * Exported so the SDK-side init blob extraction (see
 * `initialize-account.ts`'s `onPrepareDeploy` hook) can encode the
 * same bytes, and so tests can pin the encoding.
 */
export function encodeHCAInitData(eoaAddress: Address): Hex {
  return encodeAbiParameters(
    [
      { type: 'uint256', name: 'threshold' },
      {
        type: 'tuple[]',
        name: 'owners',
        components: [
          { type: 'address', name: 'owner' },
          { type: 'uint48', name: 'expiration' },
        ],
      },
      { type: 'address[]', name: 'guardians' },
    ],
    [1n, [{ owner: eoaAddress, expiration: UINT48_MAX }], []],
  )
}

/**
 * Run the HCA bootstrap for `eoaAddress`.
 *
 * Idempotent: if `accountHCAOf(eoaAddress)` is already non-zero, this
 * returns immediately with `wasDeployedInThisCall: false`. Otherwise
 * it submits `createAccount(initData)` as a sponsored Rhinestone
 * Warp Intent signed by the EOA, and polls the orchestrator for the
 * fill.
 *
 * The HCA address is returned regardless of whether we deployed it
 * or not — callers always get the canonical SCA address.
 */
export function bootstrapHCA(
  params: BootstrapHCAParams,
): ResultAsync<HCABootstrapResult, HCABootstrapError> {
  const { eoaAddress, ownerAccount, chain, publicClient, sdk: sdkOpts } = params
  const factory = ENS_SEPOLIA_CONTRACTS.HCAFactory

  // Idempotency precheck. `accountHCAOf(eoa)` is the on-chain answer
  // to "does this EOA already have an HCA?". The getter applies the
  // factory's own integrity check (`_hcaOwners[hca] == account &&
  // predictProxyAddress(account) == hca`) so a non-zero return means
  // we have a real, factory-blessed HCA — no need to redeploy.
  return fromPromise(
    readContract(publicClient, {
      address: factory,
      abi: HCA_FACTORY_ABI,
      functionName: 'accountHCAOf',
      args: [eoaAddress],
    }),
    (cause) => new HCABootstrapError({ reason: 'precheck-read-failed', cause }),
  ).andThen((existingHCA) => {
    if (existingHCA !== zeroAddress) {
      // Already bootstrapped on a previous session. Nothing to do.
      return okAsync<HCABootstrapResult, HCABootstrapError>({
        hcaAddress: existingHCA,
        wasDeployedInThisCall: false,
      })
    }

    // Fresh user: pre-compute the predicted address so the caller
    // can use it immediately, then submit the sponsored Intent. We
    // don't *strictly* need the predicted address before the call
    // (the on-chain event would tell us), but having it makes the
    // post-fill verification step a simple equality check and lets
    // downstream code start composing things (e.g. session enable
    // signatures) in parallel with the fill poll.
    const predictedHCA = fromPromise(
      readContract(publicClient, {
        address: factory,
        abi: HCA_FACTORY_ABI,
        functionName: 'computeAccountAddress',
        args: [eoaAddress],
      }),
      (cause) =>
        new HCABootstrapError({ reason: 'precheck-read-failed', cause }),
    )

    const initData = encodeHCAInitData(eoaAddress)
    const createAccountCalldata = encodeFunctionData({
      abi: HCA_FACTORY_ABI,
      functionName: 'createAccount',
      args: [initData],
    })

    return predictedHCA.andThen((hcaAddress) =>
      fromPromise(
        submitSponsoredIntent({
          ownerAccount,
          chain,
          sdkOpts,
          target: factory,
          data: createAccountCalldata,
        }),
        (cause) =>
          new HCABootstrapError({ reason: 'create-account-failed', cause }),
      ).andThen((hash) => {
        // Verify the on-chain state matches what we predicted. This
        // catches three classes of bug at once:
        //   - The factory's parser reverted but the orchestrator still
        //     reported a successful fill (shouldn't happen, but
        //     defensive).
        //   - The proxy address derived from the connected EOA drifted
        //     from what we precomputed (e.g. CREATE3 deployer somehow
        //     changed under us).
        //   - The factory's `_hcaOwners` mapping ended up empty because
        //     we accidentally hit the `alreadyDeployed = true` code
        //     path inside `createAccount` without writing the mapping.
        return fromPromise(
          readContract(publicClient, {
            address: factory,
            abi: HCA_FACTORY_ABI,
            functionName: 'getAccountOwner',
            args: [hcaAddress],
          }),
          (cause) =>
            new HCABootstrapError({
              reason: 'post-deploy-state-mismatch',
              cause,
            }),
        ).andThen((owner) => {
          if (owner.toLowerCase() !== eoaAddress.toLowerCase()) {
            return errAsync(
              new HCABootstrapError({
                reason: 'post-deploy-state-mismatch',
                cause: {
                  expected: eoaAddress,
                  actual: owner,
                  hcaAddress,
                },
              }),
            )
          }
          return okAsync<HCABootstrapResult, HCABootstrapError>({
            hcaAddress,
            wasDeployedInThisCall: true,
            hash,
          })
        })
      }),
    )
  })
}

/**
 * Submits a single sponsored Rhinestone Intent with the EOA as the
 * Intent sender (`account: { type: 'eoa' }`), waits for the fill, and
 * returns the destination-chain transaction hash. Exported only as
 * an internal helper for `bootstrapHCA`; not part of the module's
 * public surface.
 */
async function submitSponsoredIntent(params: {
  ownerAccount: Account
  chain: Chain
  sdkOpts: BootstrapHCAParams['sdk']
  target: Address
  data: Hex
}): Promise<Hex | undefined> {
  const { ownerAccount, chain, sdkOpts, target, data } = params

  const sdk = new RhinestoneSDK({
    apiKey: sdkOpts.rhinestoneApiKey,
    ...(sdkOpts.rhinestoneEndpointUrl && {
      endpointUrl: sdkOpts.rhinestoneEndpointUrl,
    }),
    ...(sdkOpts.rhinestoneCustomRpcUrls && {
      customRpcUrls: sdkOpts.rhinestoneCustomRpcUrls,
    }),
    // Bundler config is irrelevant for an EOA-mode Intent (the
    // sponsored Intent doesn't go through ERC-4337) but the SDK
    // ConstructorParameters union accepts it harmlessly. Pass through
    // when available so a future SDK release that does require it for
    // an Intent path doesn't silently fail.
    ...(sdkOpts.pimlicoApiKey && {
      bundler: { type: 'pimlico' as const, apiKey: sdkOpts.pimlicoApiKey },
    }),
  })

  // `RhinestoneSDK.createAccount` is the entry point for both SCA and
  // EOA accounts in 1.6.5. Setting `account: { type: 'eoa' }` and
  // passing `eoa: <viem Account>` switches the internal signing path
  // to `signAuthorizationsInternal` / `eoa.signTypedData(...)` — a
  // single EIP-712 prompt, no broadcast.
  const eoaAccount = await sdk.createAccount({
    account: { type: 'eoa' as const },
    eoa: ownerAccount,
  })

  const tx = await eoaAccount.sendTransaction({
    chain,
    calls: [{ to: target, value: 0n, data }],
    sponsored: true,
  })

  // `waitForExecution` polls the orchestrator until the fill lands
  // (or times out, ~210s by default — see `POLL_MAX_WAIT_MS` in
  // `@rhinestone/sdk/dist/src/execution/index.js`). Returns the fill
  // tx hash on the destination chain.
  const receipt = await eoaAccount.waitForExecution(tx, false)
  return 'fill' in receipt ? receipt.fill.hash : undefined
}
