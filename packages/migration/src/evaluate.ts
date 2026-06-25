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

/**
 * The address that holds a name's v1 token. The migration verdict is
 * viewer-independent, so we classify against this rather than a connected
 * wallet — the result reflects the name's intrinsic migratability.
 */
export const tokenHolderOf = (domain: V1Domain): Address | null => {
  const holder =
    domain.wrappedOwner?.id ?? domain.registrant?.id ?? domain.owner.id
  return (holder as Address) || null
}

export type EvaluateMigrationOptions = {
  readonly knownPublicResolvers?: readonly Address[]
  readonly addresses?: PreflightAddresses
}

/**
 * Decides whether a single v1 name can migrate to v2: classifies it, then
 * confirms eligibility against current chain state (ownership still held, no
 * frozen approval). Pass `null` when no v1 domain was found.
 */
export const evaluateMigration = async (
  client: PublicClient,
  domain: V1Domain | null,
  options: EvaluateMigrationOptions = {},
): Promise<MigrationVerdict> => {
  if (!domain) return { migratable: false, reason: 'not-found' }

  const owner = tokenHolderOf(domain)
  if (!owner) return { migratable: false, reason: 'no-path' }

  const result = classifyName(domain, owner, {
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
    owner,
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
