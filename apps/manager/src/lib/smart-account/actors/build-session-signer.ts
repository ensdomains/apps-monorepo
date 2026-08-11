/**
 * Build the `RhinestoneSessionContext` to attach to a `RhinestoneSigner` from
 * a stored standalone-HCA session.
 *
 * Same-chain: the scoped SmartSession is reconstructed (no wallet prompt) from
 * the persisted scalar fields via `rebuildDestinationSession` — the salt is
 * recomputed so the on-chain `permissionId` matches, and the ephemeral session
 * key is re-derived from its private key. Returns a `SingleSessionSignerSet`.
 *
 * Cross-chain: both the destination and source sessions are rebuilt, and a
 * `PerChainSessionSignerSet` is returned keyed by chain ID so the transport
 * can attach each session's `enableData` to its chain.
 */

import {
  deserializeChainDigests,
  getDestinationContracts,
  getSourceContracts,
  type RhinestoneStoredSession,
  rebuildDestinationSession,
  rebuildSourceSession,
} from '@ens-apps/smart-account'
import type {
  RhinestoneSessionContext,
  SingleSessionSignerSet,
} from '@ens-apps/transaction-manager'
import type { Address, Chain } from 'viem'
import { customBaseSepolia } from '@/lib/wagmi'

export function buildSessionContext(params: {
  readonly session: RhinestoneStoredSession
  readonly chain: Chain
  readonly hca: Address
}): RhinestoneSessionContext {
  const { session } = params
  const destSession = rebuildDestinationSession({
    chain: params.chain,
    hca: params.hca,
    resolver: session.resolver,
    hcaSessionNonce: BigInt(session.hcaSessionNonce),
    validUntil: BigInt(session.validUntil),
    sessionPrivateKey: session.sessionPrivateKey,
  })

  const baseResult: SingleSessionSignerSet = {
    type: 'experimental_session',
    session: destSession.session,
    verifyExecutions: true,
  }

  // Every source field is required. A partially-stored cross-chain record
  // cannot produce a valid source proof, so fall back to the same-chain signer
  // rather than assembling one from the destination's values.
  if (
    session.sourceChainId === undefined ||
    !session.sourceNexusAddress ||
    !session.sourceHashesAndChainIds ||
    session.sourceSessionToEnableIndex === undefined
  ) {
    return baseResult
  }

  const sourceSession = rebuildSourceSession({
    chain: customBaseSepolia,
    hca: params.hca,
    // The salt commits to the WALLET as the pull source, not the session key.
    wallet: session.ownerAddress,
    nexusAddress: session.sourceNexusAddress,
    validUntil: BigInt(session.validUntil),
    sessionPrivateKey: session.sessionPrivateKey,
    // Source token from the source table, destination token from the
    // destination table — separate chain-keyed tables; Sepolia has no source
    // entry and `getSourceContracts` would throw on it.
    sourceToken: getSourceContracts(session.sourceChainId).usdc,
    destinationToken: getDestinationContracts(params.chain.id).usdc,
    destinationChainId: BigInt(params.chain.id),
    maxSourceAmount: BigInt(session.maxSourceAmount ?? '100000000'),
    maxDestinationAmount: BigInt(session.maxDestinationAmount ?? '100000000'),
  })

  return {
    type: 'experimental_session',
    sessions: {
      [params.chain.id]: {
        session: destSession.session,
        enableData: {
          userSignature: session.authorization,
          hashesAndChainIds: deserializeChainDigests(session.hashesAndChainIds),
          sessionToEnableIndex: session.sessionToEnableIndex,
          hcaSessionNonce: BigInt(session.hcaSessionNonce),
        },
        verifyExecutions: true,
      },
      [session.sourceChainId]: {
        session: sourceSession.session,
        enableData: {
          userSignature: session.sourceAuthorization ?? session.authorization,
          hashesAndChainIds: deserializeChainDigests(
            session.sourceHashesAndChainIds,
          ),
          sessionToEnableIndex: session.sourceSessionToEnableIndex,
          // No `hcaSessionNonce`: that counter belongs to the destination
          // HCA's enable proof. The source validator has none, and supplying
          // one makes the source proof decode to an unsigned payload.
        },
        // The source leg only moves funds — its executions are the permit /
        // transferFrom pair the funding validator checks itself. Matches the
        // reference `liveHcaRhinestoneRegistration` signer set.
        verifyExecutions: false,
      },
    },
    verifyExecutions: true,
  }
}
