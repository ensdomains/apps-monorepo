import {
  ensL1Contracts,
  type SupportedL1Contract,
  supportedL1Chains,
} from '@ensdomains/ensjs/chain'
import { zeroAddress } from 'viem'
import { labelhash, namehash } from 'viem/ens'
import type { TimelineEvent } from './timelineEvent'

/** The ENSv1 token contracts whose token id is a pure function of the name. */
type HistoryTokenContract = 'BaseRegistrar' | 'NameWrapper'

export type HistoryToken = {
  readonly contract: HistoryTokenContract
  /** Decimal uint256, the form explorers and bigname's `token_id` print. */
  readonly tokenId: string
}

/**
 * Every supported chain's address for one contract. Keyed by address alone, as
 * `ensContractNames` is, and safe for the same reason: the app is Sepolia-scoped
 * and both contracts sit at one address per chain.
 */
const addressesOf = (contract: SupportedL1Contract): ReadonlySet<string> =>
  new Set(
    Object.values(supportedL1Chains)
      .map((chainId) => ensL1Contracts[chainId][contract].address.toLowerCase())
      .filter((address) => address !== zeroAddress),
  )

const BASE_REGISTRAR_ADDRESSES = addressesOf('ensBaseRegistrarImplementation')
const NAME_WRAPPER_ADDRESSES = addressesOf('ensNameWrapper')

/** The rows that mint or move a token, where an explorer names the token. */
const TOKEN_ROW_TYPES: ReadonlySet<string> = new Set([
  'registration',
  'transfer',
])

const ETH_SECOND_LEVEL = /^[^.]+\.eth$/

const toTokenId = (hash: `0x${string}`): string => BigInt(hash).toString(10)

/**
 * The token a registration or transfer row is about, where it can be derived
 * exactly from what bigname serves. bigname does not serve per-row token ids,
 * so the emitting contract decides which token it is:
 *
 * - BaseRegistrar (ERC-721): a `.eth` second-level name's token id is its
 *   labelhash as a uint256.
 * - NameWrapper (ERC-1155): any wrapped name's token id is its namehash as a
 *   uint256.
 *
 * Anything else has none. An ENSv2 registry's token id is the labelhash with
 * its low 32 bits replaced by a version counter that unregister,
 * re-registration and each `grantRoles`/`revokeRoles` call that changes roles
 * bump (`PermissionedRegistry._constructTokenId`, `_regenerate`). History carries
 * no counter, and its permission rows do not map one-to-one to bumps, so any
 * id shown would be a guess.
 *
 * The contract is the row's, not the name's: a migrated name keeps its
 * BaseRegistrar and NameWrapper rows from before the migration, and those
 * tokens were real at the time.
 */
export const historyTokenId = (
  event: TimelineEvent,
): HistoryToken | undefined => {
  if (!TOKEN_ROW_TYPES.has(event.type) || !event.name) return undefined
  const contract = event.contractAddress?.toLowerCase()
  if (!contract) return undefined
  if (BASE_REGISTRAR_ADDRESSES.has(contract)) {
    if (!ETH_SECOND_LEVEL.test(event.name)) return undefined
    const [label] = event.name.split('.')
    return { contract: 'BaseRegistrar', tokenId: toTokenId(labelhash(label)) }
  }
  if (NAME_WRAPPER_ADDRESSES.has(contract))
    return { contract: 'NameWrapper', tokenId: toTokenId(namehash(event.name)) }
  return undefined
}
