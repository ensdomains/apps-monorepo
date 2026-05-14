/**
 * Registration-scoped Rhinestone smart-session builder.
 *
 * Produces the `actions` array for a Rhinestone `Session` whose only purpose
 * is to bundle the registration + renewal flows through a bundler. Replaces
 * the previous `[{ policies: [{ type: 'sudo' }] }]` wildcard.
 *
 * Threat-model summary (see `fix-sca-permisssions` design discussion):
 *  - Session key lives in browser localStorage and must be assumed
 *    exfiltratable (XSS, supply chain, extension, etc.).
 *  - Every action below pins (target, selector) and, where relevant,
 *    constrains static-offset args via UniversalActionPolicy so a stolen
 *    session key cannot redirect funds to an attacker, register names to an
 *    attacker, or hijack HCA ownership.
 *  - Residual surface (accepted "for now"): `ETHRegistrar.renew(...)` has no
 *    on-chain `owner` arg — a stolen key can renew an attacker-controlled
 *    name on the user's USDC/DAI balance. Bounded only by token balance and
 *    `validUntil`. Revisit before mainnet (likely via
 *    `ERC20SpendingLimitsPolicy`).
 *
 * Calldata offset semantics (verified against on-chain
 * UniversalActionPolicy + Biconomy abstractjs `calldataArgument` helper):
 *   `(arg index N) → offset = (N - 1) * 32`, post-selector. Each `ParamRule`
 *   reads exactly 32 bytes; `referenceValue` is left-padded to 32 by the SDK
 *   for hex args.
 */

import {
  ENS_SEPOLIA_CONTRACTS,
  SUPPORTED_TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import {
  ethRegistrarCommitSnippet,
  ethRegistrarRegisterSnippet,
  ethRegistrarRenewSnippet,
} from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import { verifiableFactoryDeployProxySnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import type { Session } from '@rhinestone/sdk'
import type { Address } from 'viem'
import { erc20Abi, getAbiItem, toFunctionSelector } from 'viem'
import { HCA_FACTORY_ABI } from '@/lib/hca-factory.abi'

/** Default session lifetime: 30 days. */
export const REGISTRATION_SESSION_VALIDITY_SECONDS = 30 * 24 * 60 * 60

/**
 * Function selectors derived from canonical ABIs at module load.
 *
 * `@ensdomains/ensjs-abi` ships per-function snippets that bundle the
 * function with its associated errors, so we use `getAbiItem` with the
 * function name to pick the function entry. With concrete (literal) abi
 * + name, TypeScript narrows the return type to the matching
 * `AbiFunction` — no `as` cast required.
 *
 * Result: selector typos are compile errors, and any upstream ABI change
 * regenerates the selectors automatically.
 */
const SELECTORS = {
  commit: toFunctionSelector(
    getAbiItem({ abi: ethRegistrarCommitSnippet, name: 'commit' }),
  ),
  register: toFunctionSelector(
    getAbiItem({ abi: ethRegistrarRegisterSnippet, name: 'register' }),
  ),
  renew: toFunctionSelector(
    getAbiItem({ abi: ethRegistrarRenewSnippet, name: 'renew' }),
  ),
  approve: toFunctionSelector(getAbiItem({ abi: erc20Abi, name: 'approve' })),
  deployProxy: toFunctionSelector(
    getAbiItem({
      abi: verifiableFactoryDeployProxySnippet,
      name: 'deployProxy',
    }),
  ),
  setAccountOwner: toFunctionSelector(
    getAbiItem({ abi: HCA_FACTORY_ABI, name: 'setAccountOwner' }),
  ),
} as const

export interface BuildRegistrationSessionActionsParams {
  /** Smart-account (Nexus) address. Pinned as `HCAFactory.setAccountOwner.smartAccount`. */
  readonly smartAccountAddress: Address
  /** EOA owning the smart account. Pinned as `register.owner` and `HCAFactory.setAccountOwner.eoa`. */
  readonly eoaAddress: Address
}

/**
 * Build the Rhinestone session actions for the registration/renewal scope.
 *
 * Returns a non-empty array of `ScopedAction`s. Plug into a `Session` along
 * with `owners` and `chain` at the call site.
 */
export function buildRegistrationSessionActions(
  params: BuildRegistrationSessionActionsParams,
): NonNullable<Session['actions']> {
  const { smartAccountAddress, eoaAddress } = params

  const ETHRegistrar = ENS_SEPOLIA_CONTRACTS.ETHRegistrar
  const VerifiableFactory = ENS_SEPOLIA_CONTRACTS.VerifiableFactory
  const PermissionedResolverImpl = ENS_SEPOLIA_CONTRACTS.DedicatedResolverImpl
  const HCAFactory = ENS_SEPOLIA_CONTRACTS.HCAFactory
  const USDC = SUPPORTED_TOKENS.USDC
  const DAI = SUPPORTED_TOKENS.DAI

  return [
    // 1. ETHRegistrar.commit(bytes32) — opaque hash, fully gated by
    //    (target, selector). No rules required; including a
    //    UniversalActionPolicy with zero rules is rejected by the SDK
    //    (rules must be a non-empty tuple), so we use SudoPolicy here. The
    //    (target, selector) match is the actual security boundary.
    {
      target: ETHRegistrar,
      selector: SELECTORS.commit,
      policies: [{ type: 'sudo' as const }],
    },

    // 2. ETHRegistrar.register(string,address,bytes32,address,address,uint64,address,bytes32)
    //    Pin owner == EOA. The dApp must pass `owner = eoaAddress`
    //    (see registrationUi.machine.ts). Registering directly to the EOA
    //    means the on-chain ENS owner is the human, so:
    //      - "My names" indexer lookups by EOA work without HCA-equivalence,
    //      - Registry-level checks (transfer / setResolver / wrap) accept
    //        either a direct EOA call OR an SCA call unwrapped through
    //        HCAEquivalence to the same EOA.
    //    Subsequent record edits on the dedicated resolver continue to work
    //    because the EACL grantee is also the EOA (see deployingResolver
    //    in registration.machine.ts).
    {
      target: ETHRegistrar,
      selector: SELECTORS.register,
      policies: [
        {
          type: 'universal-action' as const,
          rules: [
            {
              condition: 'equal' as const,
              calldataOffset: 32n, // arg #2 (owner)
              referenceValue: eoaAddress,
            },
          ],
        },
      ],
    },

    // 3. ETHRegistrar.renew(string,uint64,address,bytes32)
    //    No constrainable owner arg; transitively gated by the
    //    approve allowlist (only USDC/DAI can build allowance against
    //    ETHRegistrar). Residual exfiltration via attacker-name renewal
    //    is the accepted-for-now hole.
    {
      target: ETHRegistrar,
      selector: SELECTORS.renew,
      policies: [{ type: 'sudo' as const }],
    },

    // 4. USDC.approve(address spender, uint256 amount) — pin spender.
    {
      target: USDC,
      selector: SELECTORS.approve,
      policies: [
        {
          type: 'universal-action' as const,
          rules: [
            {
              condition: 'equal' as const,
              calldataOffset: 0n, // arg #1 (spender)
              referenceValue: ETHRegistrar,
            },
          ],
        },
      ],
    },

    // 5. DAI.approve(address spender, uint256 amount) — pin spender.
    {
      target: DAI,
      selector: SELECTORS.approve,
      policies: [
        {
          type: 'universal-action' as const,
          rules: [
            {
              condition: 'equal' as const,
              calldataOffset: 0n, // arg #1 (spender)
              referenceValue: ETHRegistrar,
            },
          ],
        },
      ],
    },

    // 6. VerifiableFactory.deployProxy(address impl, uint256 salt, bytes initData)
    //    Pin implementation. `init.owner` lives inside the dynamic `bytes`
    //    arg and cannot be constrained with stock UAP — but a malicious
    //    init.owner only matters if the resulting proxy is set as a name's
    //    resolver, which is recoverable by the EOA via
    //    `registry.setResolver` from the connected wallet (HCAEquivalence).
    {
      target: VerifiableFactory,
      selector: SELECTORS.deployProxy,
      policies: [
        {
          type: 'universal-action' as const,
          rules: [
            {
              condition: 'equal' as const,
              calldataOffset: 0n, // arg #1 (implementation)
              referenceValue: PermissionedResolverImpl,
            },
          ],
        },
      ],
    },

    // 7. HCAFactory.setAccountOwner(address smartAccount, address eoa)
    //    Pin both args — the session can only register HCA ownership for
    //    its own SCA → known EOA, never rewrite to an attacker EOA.
    {
      target: HCAFactory,
      selector: SELECTORS.setAccountOwner,
      policies: [
        {
          type: 'universal-action' as const,
          rules: [
            {
              condition: 'equal' as const,
              calldataOffset: 0n, // arg #1 (smartAccount)
              referenceValue: smartAccountAddress,
            },
            {
              condition: 'equal' as const,
              calldataOffset: 32n, // arg #2 (eoa)
              referenceValue: eoaAddress,
            },
          ],
        },
      ],
    },
  ]
}
