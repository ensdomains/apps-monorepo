/**
 * Rebuild the cross-chain funding context for a stored multi-chain session.
 *
 * A cross-chain intent is NOT sent from the HCA — it is sent from the funding
 * Nexus on the source chain, with the HCA named as `recipient`. The transport
 * therefore needs a live `RhinestoneAccount` for the Nexus, which only the SDK
 * can produce and which nothing persists across reloads. This re-derives it
 * from the stored session's scalars.
 *
 * The derivation is deterministic (CREATE2 over the funding validator's
 * `SessionConfig`) and deploys nothing, so it is safe to run on every mount.
 * It MUST reproduce the address recorded at session-creation time: the stored
 * authorization signature covers THAT account, so if the inputs have drifted,
 * submitting from the newly-derived one would be rejected. A mismatch fails
 * loudly here rather than as an opaque `InvalidSignature()` at claim time.
 */

import {
  createSourceNexus,
  getDestinationContracts,
  getSourceContracts,
  type RhinestoneStoredSession,
  SessionEnableError,
} from '@ens-apps/smart-account'
import type { CrossChainFundingContext } from '@ens-apps/transaction-manager'
import type { RhinestoneAccount, RhinestoneSDK } from '@rhinestone/sdk'
import { errAsync, okAsync, type ResultAsync } from 'neverthrow'
import type { Account, Address, Chain } from 'viem'
import { isAddressEqual } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { customBaseSepolia } from '@/lib/wagmi'

/** Default caps, matching `session.actors.ts`, for pre-cap stored sessions. */
const DEFAULT_MAX_AMOUNT = '100000000'

/**
 * Returns `null` when the session is same-chain only (nothing to derive), and
 * an erroring `ResultAsync` when the derivation disagrees with what was stored.
 */
export function buildCrossChainContext(params: {
  readonly session: RhinestoneStoredSession
  readonly sdk: RhinestoneSDK
  /** The connected wallet as a viem `Account` — the Nexus's ECDSA owner. */
  readonly walletAccount: Account
  /** Destination chain (Sepolia). */
  readonly chain: Chain
  readonly hca: Address
  /** The HCA's own SDK account, whose `config` becomes the `recipient`. */
  readonly hcaAccount: RhinestoneAccount
}): ResultAsync<CrossChainFundingContext, SessionEnableError> | null {
  const { session } = params
  // Every source field is required — a partially-stored record cannot produce
  // a Nexus matching what the authorization signed over.
  if (
    session.sourceChainId === undefined ||
    !session.sourceNexusAddress ||
    !session.sessionPrivateKey
  ) {
    return null
  }

  const sourceChainId = session.sourceChainId
  const storedNexus: Address = session.sourceNexusAddress
  // Source token from the source table, destination token from the destination
  // table — separate chain-keyed tables, and each throws on the other's ID.
  const sourceToken = getSourceContracts(sourceChainId).usdc
  const destinationToken = getDestinationContracts(params.chain.id).usdc

  return createSourceNexus({
    sdk: params.sdk,
    chain: customBaseSepolia,
    wallet: session.ownerAddress,
    walletAccount: params.walletAccount,
    hca: params.hca,
    sourceToken,
    destinationToken,
    destinationChainId: BigInt(params.chain.id),
    sessionAccount: privateKeyToAccount(session.sessionPrivateKey),
    validUntil: BigInt(session.validUntil),
    maxSourceAmount: BigInt(session.maxSourceAmount ?? DEFAULT_MAX_AMOUNT),
    maxDestinationAmount: BigInt(
      session.maxDestinationAmount ?? DEFAULT_MAX_AMOUNT,
    ),
  }).andThen((nexus) =>
    isAddressEqual(nexus.address, storedNexus)
      ? okAsync({
          account: nexus.account,
          address: nexus.address,
          recipient: params.hcaAccount.config,
          chainId: sourceChainId,
          sourceToken,
          destinationToken,
        } satisfies CrossChainFundingContext)
      : errAsync(
          new SessionEnableError({
            message:
              `Derived funding Nexus ${nexus.address} does not match the stored ` +
              `${storedNexus}. The session's authorization covers the stored ` +
              'account, so an intent sent from this one would be rejected. ' +
              'Re-authorize the session.',
          }),
        ),
  )
}
