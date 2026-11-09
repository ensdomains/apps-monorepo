import { type Address, getAddress, isAddress, zeroAddress } from 'viem'
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
  readonly owner?: Address | null
  readonly coins?: readonly {
    readonly coinType: number
    readonly value: string
  }[]
  readonly resolverAddress?: Address | null
  readonly primaryName?: string | null
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
}: RelatedEntityFacts): readonly PaletteRelatedEntity[] => {
  if (entity.type === 'address') {
    return related(
      primaryName ? { type: 'name', name: primaryName } : undefined,
      'primary-name',
    )
  }
  const parent = getParentName(entity.name)
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
