import { type Address, getAddress, isAddress, zeroAddress } from 'viem'
import {
  getEth2LDAncestor,
  isEthName,
  isRegistrable,
} from '@/utils/ens/tldHelpers'
import { isCanonicalName } from '@/utils/token/isNormalized'
import { getEntityId } from './core/search'
import type { PaletteEntity } from './core/types'

export type PaletteRelation =
  | 'owner'
  | 'manager'
  | 'eth-address'
  | 'resolver'
  | 'parent'
  | 'primary-name'

export type PaletteRelatedEntity = {
  readonly entity: PaletteEntity
  readonly relations: readonly PaletteRelation[]
}

type RelatedEntityFacts = {
  readonly entity: PaletteEntity
  readonly isAvailable?: boolean
  readonly owner?: Address | null
  readonly coins?: readonly {
    readonly coinType: number
    readonly value: string
  }[]
  readonly resolverAddress?: Address | null
  readonly primaryName?: string | null
}

export const getRelationshipRegistrationName = (
  entity: PaletteEntity | undefined,
): string | undefined => {
  if (entity?.type !== 'name' || !isCanonicalName(entity.name)) return undefined
  return isRegistrable(entity.name)
    ? entity.name
    : (getEth2LDAncestor(entity.name) ?? undefined)
}

export type PaletteRelationshipReadState =
  | 'inactive'
  | 'checking'
  | 'available'
  | 'failed'
  | 'ready'

export const getRelationshipReadState = ({
  entity,
  isEnabled,
  availability,
}: {
  readonly entity: PaletteEntity | undefined
  readonly isEnabled: boolean
  readonly availability: {
    readonly data?: { readonly isAvailable: boolean }
    readonly isError: boolean
    readonly isFetching: boolean
  }
}): PaletteRelationshipReadState => {
  if (!isEnabled || !entity) return 'inactive'
  if (entity.type === 'address') return 'ready'
  // An unsafe spelling never reaches a lookup; its actions stop at the execution plan.
  if (!isCanonicalName(entity.name)) return 'inactive'
  if (!getRelationshipRegistrationName(entity)) return 'ready'
  if (availability.isError) return 'failed'
  if (availability.isFetching || !availability.data) return 'checking'
  return availability.data.isAvailable ? 'available' : 'ready'
}

const ETH_COIN_TYPE = 60

const toAddressEntity = (value?: string | null): PaletteEntity | undefined =>
  value && isAddress(value, { strict: false }) && value !== zeroAddress
    ? { type: 'address', address: getAddress(value) }
    : undefined

// A DNS 2LD's registry entry holds the delegated manager, not the DNS owner.
const getOwnerRelation = (name: string): PaletteRelation =>
  name.split('.').length === 2 && !name.endsWith('.eth') ? 'manager' : 'owner'

const getParentName = (name: string): string | undefined => {
  const labels = name.split('.')
  return labels.length > 2 ? labels.slice(1).join('.') : undefined
}

// Merges relations that point at the same entity, keeping first-seen order.
const mergeRelated = (
  related: readonly PaletteRelatedEntity[],
): readonly PaletteRelatedEntity[] =>
  [...new Set(related.map(({ entity }) => getEntityId(entity)))].flatMap(
    (id) => {
      const matches = related.filter(({ entity }) => getEntityId(entity) === id)
      const first = matches.at(0)
      return first
        ? [
            {
              entity: first.entity,
              relations: matches.flatMap(({ relations }) => relations),
            },
          ]
        : []
    },
  )

const related = (
  entity: PaletteEntity | undefined,
  relation: PaletteRelation,
): readonly PaletteRelatedEntity[] =>
  entity ? [{ entity, relations: [relation] }] : []

/** The names and addresses a name or address points at, for the palette's Related group. */
export const getRelatedEntities = ({
  entity,
  owner,
  coins,
  resolverAddress,
  primaryName,
  isAvailable,
}: RelatedEntityFacts): readonly PaletteRelatedEntity[] => {
  if (entity.type === 'address') {
    return related(
      primaryName ? { type: 'name', name: primaryName } : undefined,
      'primary-name',
    )
  }
  const parent = getParentName(entity.name)
  if (isAvailable && isEthName(entity.name))
    return related(
      parent ? { type: 'name', name: parent } : undefined,
      'parent',
    )
  const ethAddress = coins?.find(
    ({ coinType }) => coinType === ETH_COIN_TYPE,
  )?.value
  // The resolver is a contract with its own page, so it never merges with a person's address.
  return [
    ...mergeRelated([
      ...related(toAddressEntity(owner), getOwnerRelation(entity.name)),
      ...related(toAddressEntity(ethAddress), 'eth-address'),
    ]),
    ...related(toAddressEntity(resolverAddress), 'resolver'),
    ...related(parent ? { type: 'name', name: parent } : undefined, 'parent'),
  ]
}

type RelationshipRead<T> = {
  readonly data?: T
  readonly isLoading: boolean
  readonly isError: boolean
}
type RelationshipReads = {
  readonly availability: RelationshipRead<{ readonly isAvailable: boolean }>
  readonly owner: RelationshipRead<{ readonly owner: Address } | null>
  readonly ethAddress: RelationshipRead<string | null>
  readonly resolver: RelationshipRead<Address | null>
  readonly primaryName: RelationshipRead<string | null>
}

const getSuccessfulFact = <T>(read: RelationshipRead<T>): T | undefined =>
  read.isError ? undefined : read.data

const hasCurrentRegistration = (
  entity: PaletteEntity | undefined,
  availability: RelationshipReads['availability'],
): boolean =>
  !getRelationshipRegistrationName(entity) ||
  getSuccessfulFact(availability)?.isAvailable === false

const getActiveRelationshipSources = (
  state: PaletteRelationshipReadState,
  entity: PaletteEntity | undefined,
  isEnabled: boolean,
): readonly (keyof RelationshipReads)[] => [
  ...(state === 'checking' || state === 'failed'
    ? ['availability' as const]
    : []),
  ...(state === 'ready' && entity?.type === 'name'
    ? (['owner', 'ethAddress', 'resolver'] as const)
    : []),
  ...(isEnabled && entity?.type === 'address' ? ['primaryName' as const] : []),
]

export const getRelationshipPresentation = ({
  entity,
  state,
  isEnabled,
  reads,
}: {
  readonly entity: PaletteEntity | undefined
  readonly state: PaletteRelationshipReadState
  readonly isEnabled: boolean
  readonly reads: RelationshipReads
}) => {
  const sources = getActiveRelationshipSources(state, entity, isEnabled)
  const canUseFacts =
    (state === 'ready' || state === 'inactive') &&
    hasCurrentRegistration(entity, reads.availability)
  const ethAddress = getSuccessfulFact(reads.ethAddress)
  const entities = entity
    ? getRelatedEntities({
        entity,
        isAvailable: reads.availability.data?.isAvailable,
        owner: canUseFacts ? getSuccessfulFact(reads.owner)?.owner : undefined,
        coins:
          canUseFacts && ethAddress
            ? [{ coinType: ETH_COIN_TYPE, value: ethAddress }]
            : undefined,
        resolverAddress: canUseFacts
          ? getSuccessfulFact(reads.resolver)
          : undefined,
        primaryName: getSuccessfulFact(reads.primaryName),
      })
    : []
  const failedSources = sources.filter((source) => reads[source].isError)
  return {
    entities,
    failedSources,
    hasError: failedSources.length > 0,
    isLoading:
      state === 'checking' || sources.some((source) => reads[source].isLoading),
  }
}
