import type { Address, PublicClient } from 'viem'
import { DEFAULT_PREFLIGHT_ADDRESSES, KNOWN_PUBLIC_RESOLVERS } from './chain'
import {
  classifyName,
  type IneligibleReason,
  type MigrationTokenType,
} from './classify'
import { type PreflightAddresses, runEligibilityChecks } from './preflight'
import type { V1Domain } from './types'

/**
 * Why a v1 name can't migrate. Extends the classifier's reasons with `no-path`
 * (no eligible token type) and `not-found` (no matching v1 domain).
 */
export type MigrationBlockReason = IneligibleReason | 'no-path' | 'not-found'

export type MigrationVerdict =
  | {
      readonly migratable: true
      readonly tokenType: MigrationTokenType
      /** Address holding the v1 token (registrant / wrapped owner). */
      readonly tokenHolder: Address
    }
  | { readonly migratable: false; readonly reason: MigrationBlockReason }

export type EvaluateMigrationOptions = {
  readonly knownPublicResolvers?: readonly Address[]
  readonly addresses?: PreflightAddresses
}

/**
 * Decides whether a single v1 name can migrate to v2 for `ownerAddress`:
 * classifies the name against that wallet, then confirms eligibility against
 * current chain state (ownership still held, no frozen approval). The verdict
 * is owner-scoped — exactly as the manager evaluates the connected wallet's own
 * names. Pass `null` when no v1 domain was found.
 */
export const evaluateMigration = async (
  client: PublicClient,
  domain: V1Domain | null,
  ownerAddress: Address,
  options: EvaluateMigrationOptions = {},
): Promise<MigrationVerdict> => {
  if (!domain) return { migratable: false, reason: 'not-found' }

  const result = classifyName(domain, ownerAddress, {
    knownPublicResolvers:
      options.knownPublicResolvers ?? KNOWN_PUBLIC_RESOLVERS,
  })
  if (!result) return { migratable: false, reason: 'no-path' }
  if (result.type === 'ineligible') {
    return { migratable: false, reason: result.name.reason }
  }

  const classified = result.name
  const eligibility = await runEligibilityChecks(
    client,
    [classified],
    ownerAddress,
    options.addresses ?? DEFAULT_PREFLIGHT_ADDRESSES,
  )

  if (eligibility.eligible.length > 0) {
    return {
      migratable: true,
      tokenType: classified.tokenType,
      tokenHolder: classified.tokenHolder,
    }
  }
  if (eligibility.frozen.length > 0) {
    return { migratable: false, reason: 'frozen-approval' }
  }
  return { migratable: false, reason: 'already-migrated' }
}
