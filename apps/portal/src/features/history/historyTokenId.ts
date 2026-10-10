import {
  ensL1Contracts,
  type SupportedL1Contract,
  supportedL1Chains,
} from '@ensdomains/ensjs/chain'
import { zeroAddress } from 'viem'
import { labelhash, namehash } from 'viem/ens'
import type { TimelineEvent } from './timelineEvent'

/**
 * Where a row's token lives: the ENSv1 token contracts, whose token id is a
 * pure function of the name, or an ENSv2 registry, whose token id bigname
 * serves.
 */
type HistoryTokenContract = 'BaseRegistrar' | 'NameWrapper' | 'Registry'

export type HistoryToken = {
  readonly contract: HistoryTokenContract
  /** Decimal uint256, the form explorers and bigname's `token_id` print. */
  readonly tokenId: string
}

/**
 * Every supported chain's address for one contract. Keyed by address alone, as
 * `ensContractNames` is: each contract sits at one address per chain.
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

const DECIMAL = /^\d+$/

/**
 * The token a registration or transfer row is about.
 *
 * A served `data.token_id` wins. After v0.4.1 bigname serves it on ENSv2
 * registry rows: the versioned ERC-1155 token at the row's own position, which
 * nothing else can supply. The id is the labelhash with its low 32 bits
 * replaced by a version counter that unregister, re-registration and each role
 * change bump (`PermissionedRegistry._constructTokenId`, `_regenerate`), and
 * history carries no counter. So without the served field an ENSv2 row has
 * none, as on v0.4.1.
 *
 * Otherwise the emitting contract decides, where the id is exact:
 *
 * - BaseRegistrar (ERC-721): a `.eth` second-level name's token id is its
 *   labelhash as a uint256.
 * - NameWrapper (ERC-1155): any wrapped name's token id is its namehash as a
 *   uint256.
 *
 * The contract is the row's, not the name's: a migrated name keeps its
 * BaseRegistrar and NameWrapper rows from before the migration, and those
 * tokens were real at the time.
 */
export const historyTokenId = (
  event: TimelineEvent,
): HistoryToken | undefined => {
  if (!TOKEN_ROW_TYPES.has(event.type)) return undefined
  const served =
    event.data && 'token_id' in event.data ? event.data.token_id : undefined
  if (typeof served === 'string' && DECIMAL.test(served))
    return { contract: 'Registry', tokenId: served }
  if (!event.name) return undefined
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
