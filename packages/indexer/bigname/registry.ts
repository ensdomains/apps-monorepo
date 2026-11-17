import type { AuditedPage, Page } from '../reads/common.types'
import type {
  RecordResource,
  Registry,
  RegistryLabel,
  ResolverLink,
  ResolverOverview,
  ResolverRoleGrant,
  RootRoleGrants,
} from '../reads/registry.types'
import { toAddress, toDate, toExpiresAt } from './adapters'
import type * as T from './types'

const toPage = <Row, Item>(
  { data, page }: T.Envelope<readonly Row[]>,
  toItem: (row: Row) => Item,
): Page<Item> => ({
  items: data.map(toItem),
  nextCursor: page?.next_cursor ?? null,
  totalCount: page?.total_count ?? null,
})

const toAuditedPage = <Row, Item>(
  envelope: T.Envelope<readonly Row[]>,
  toItem: (row: Row) => Item,
): AuditedPage<Item> => ({
  ...toPage(envelope, toItem),
  completeness: envelope.meta.completeness ?? 'full',
})

export const toRegistry = (registry: T.Registry): Registry => ({
  address: registry.address,
  name: registry.name && {
    name: registry.name.name,
    namehash: registry.name.namehash,
  },
  createdBlock: registry.created_block_number,
  createdAt: toDate(registry.created_at),
  createdTransactionHash: registry.created_transaction_hash,
  labelCount: registry.counts.labels,
  referencedBy: {
    items: registry.referenced_by.data.map(({ name, namehash }) => ({
      name,
      namehash,
    })),
    nextCursor: registry.referenced_by.page.next_cursor,
    totalCount: registry.referenced_by.page.total_count,
  },
})

export const toRegistryLabels = (
  envelope: T.Envelope<readonly T.RegistryLabel[]>,
): Page<RegistryLabel> =>
  toPage(envelope, (row) => ({
    name: row.name,
    displayName: row.display_name,
    namehash: row.namehash,
    labelhash: row.labelhash ?? null,
    owner: toAddress(row.owner),
    expiresAt: toExpiresAt(row),
    ...(row.role_holder_count !== undefined && {
      roleHolderCount: row.role_holder_count,
    }),
  }))

export const toResolverOverview = (
  overview: T.ResolverOverview,
): ResolverOverview => ({
  address: overview.address,
  mirrorRegistry: overview.mirror?.registry.address ?? null,
  boundNames: {
    items: overview.bound_names.data.map((record) => ({
      name: record.name,
      namehash: record.namehash,
      owner: toAddress(record.owner),
    })),
    nextCursor: overview.bound_names.page.next_cursor,
    totalCount: overview.bound_names.page.total_count,
  },
})

export const toResolverLinks = (
  envelope: T.Envelope<readonly T.ResolverLink[]>,
): AuditedPage<ResolverLink> =>
  toAuditedPage(envelope, (link) => ({
    recordId: link.record_id,
    namehash: link.namehash,
    isDefault: link.default,
    name: link.name ?? null,
  }))

const toBigint = (decimal: string | undefined): bigint | null =>
  decimal !== undefined && /^\d+$/.test(decimal) ? BigInt(decimal) : null

const toSelector = (selector: T.RecordResourceSelector): RecordResource => {
  switch (selector.kind) {
    case 'address':
      return {
        kind: 'address',
        hash: selector.hash,
        coinType: toBigint(
          selector.coin_type_decimal ?? selector.coin_type?.toString(),
        ),
      }
    case 'text':
    case 'data':
      return {
        kind: selector.kind,
        hash: selector.hash,
        key: selector.key ?? selector.key_bytes ?? null,
      }
    case 'abi':
      return {
        kind: 'abi',
        hash: selector.hash,
        contentType: toBigint(
          selector.content_type_decimal ?? selector.content_type?.toString(),
        ),
      }
    case 'interface':
      return {
        kind: 'interface',
        hash: selector.hash,
        interfaceId: selector.interface_id,
      }
  }
}

// An `argument` resource authorizes several setters; the screens show the first, under the argument's own hash.
const toRecordResource = (
  resource: T.RecordResource | undefined,
): RecordResource | null => {
  if (!resource) return null
  if (resource.kind !== 'argument') return toSelector(resource)
  const [first] = resource.selectors
  return first ? { ...toSelector(first), hash: resource.hash } : null
}

export const toResolverRoles = (
  envelope: T.Envelope<readonly T.ResolverRole[]>,
): AuditedPage<ResolverRoleGrant> =>
  toAuditedPage(envelope, (role) => ({
    account: role.address,
    registrationId: role.registration_id,
    powers: role.powers,
    eacResource: role.eac_resource ?? null,
    recordResource: toRecordResource(role.record_resource),
    name: role.name ?? null,
    grantedAt: role.grant_event
      ? {
          blockNumber: role.grant_event.block_number,
          timestamp: toDate(role.grant_event.timestamp),
          transactionHash: role.grant_event.transaction_hash ?? null,
        }
      : null,
  }))

/** Root rows only; bigname also lists registry-scoped rows on a registry read. */
export const toRootRoleGrants = (
  envelope: T.PermissionsResponse,
  registry: string,
): RootRoleGrants => {
  const roots = {
    ...envelope,
    data: envelope.data.filter(
      (row) =>
        row.grant_scope.kind === 'root' &&
        (row.grant_scope.detail.registry?.address ?? registry).toLowerCase() ===
          registry.toLowerCase(),
    ),
  }
  return {
    ...toAuditedPage(roots, (row) => ({
      account: row.address,
      powers: row.powers,
    })),
    hasUnlistedOperators:
      envelope.meta.unlisted_permission_surfaces?.includes(
        'ens_v2_registry_operators',
      ) ?? false,
  }
}
