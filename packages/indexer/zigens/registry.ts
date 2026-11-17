import type {
  BoundName,
  NameRef,
  Registry,
  RegistryLabel,
  ResolverLink,
  ResolverRoleGrant,
  RootRoleGrant,
} from '../reads/registry.types'
import { toPowerName } from '../shared/powers'
import { secondsToDate, toAccount, toHash } from '../shared/values'
import type {
  RegistryRow,
  ResolverBinding,
  RoleAssignment,
  V2Domain,
} from './types'

const ZERO_RESOURCE = /^0x0*$/

export const isRootResource = (resource: string) => ZERO_RESOURCE.test(resource)

export const toRegistry = (registry: RegistryRow): Registry => ({
  address: toAccount(registry.address) ?? toHash(registry.address),
  // zigens serves an empty name for a registry nothing points at.
  name: registry.name
    ? { name: registry.name, namehash: toHash(registry.namehash) }
    : null,
  createdBlock: registry.createdBlock,
  createdAt: secondsToDate(registry.createdAt),
  createdTransactionHash: null,
  labelCount: registry.labelCount,
  referencedBy: {
    items: registry.referencedByConnection.edges.map(
      ({ node }): NameRef => ({
        name: node.normalizedName ?? node.name ?? node.id,
        namehash: toHash(node.id),
      }),
    ),
    nextCursor: registry.referencedByConnection.pageInfo.hasNextPage
      ? registry.referencedByConnection.pageInfo.endCursor
      : null,
    totalCount: registry.referencedByCount,
  },
})

export const toRegistryLabel = (
  domain: V2Domain,
  includeCounts: boolean | undefined,
): RegistryLabel => ({
  name: domain.name ?? domain.id,
  displayName: domain.normalizedName ?? domain.name ?? domain.id,
  namehash: toHash(domain.id),
  labelhash: toHash(domain.labelhash),
  owner: toAccount(domain.owner.id),
  expiresAt: secondsToDate(domain.expiryDate),
  ...(includeCounts && { roleHolderCount: domain.roleHolderCount }),
})

export const toV2BoundName = ({ domain }: ResolverBinding): BoundName | null =>
  domain && {
    name: domain.name ?? domain.id,
    namehash: toHash(domain.id),
    owner: toAccount(domain.owner.id),
  }

/** Only record-model resolvers link names to records. */
export const toResolverLink = ({
  recordId,
  domain,
}: ResolverBinding): ResolverLink | null =>
  recordId === null || !domain
    ? null
    : {
        recordId,
        namehash: toHash(domain.id),
        isDefault: ZERO_RESOURCE.test(domain.id),
        name: domain.name || null,
      }

const toDecimal = (hex: string) =>
  /^0x[0-9a-f]+$/i.test(hex) ? BigInt(hex).toString() : null

export const toResolverRoleGrant = (
  role: RoleAssignment,
): ResolverRoleGrant | null => {
  const account = toAccount(role.account)
  return (
    account && {
      account,
      // zigens has no registration handle; the EAC resource identifies the grant.
      registrationId: null,
      powers: role.permissions.map(toPowerName),
      eacResource: toDecimal(role.resource),
      recordResource: null,
      name: role.name,
      grantedAt: {
        blockNumber: role.blockNumber,
        timestamp: secondsToDate(role.timestamp),
        transactionHash: toHash(role.transactionHash),
      },
    }
  )
}

export const toRootRoleGrant = (role: RoleAssignment): RootRoleGrant | null => {
  const account = toAccount(role.account)
  return account && isRootResource(role.resource)
    ? { account, powers: role.permissions.map(toPowerName) }
    : null
}

/** Each name `account` holds a label role on, with every power it holds there. */
export const toPowersByName = (
  roles: readonly RoleAssignment[],
): ReadonlyMap<string, readonly string[]> =>
  new Map(
    roles
      .filter((role) => role.name !== null && !isRootResource(role.resource))
      .map((role) => role.name ?? '')
      .filter((name, index, names) => names.indexOf(name) === index)
      .map((name) => [
        name,
        [
          ...new Set(
            roles
              .filter(
                (role) => role.name === name && !isRootResource(role.resource),
              )
              .flatMap((role) => role.permissions.map(toPowerName)),
          ),
        ],
      ]),
  )
