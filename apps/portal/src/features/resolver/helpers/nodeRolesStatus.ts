import { match, P } from 'ts-pattern'
import { ROOT_RESOURCE } from '@/lib/roles/resolverRoles'
import type { NodeDetailSheetProps } from '../components/NodeDetailSheet'
import type {
  ResolverOverview,
  ResolverRole,
} from '../hooks/useResolverOverview'

// A resolver-wide grant has no name by design; it is not a grant we failed to place.
const isUnplaced = (role: ResolverRole) =>
  role.name === null && role.resource !== ROOT_RESOURCE.toString()

/** How much of the node's roles the sheet can claim, until the read completes. */
export const toNodeRolesStatus = (
  overview: {
    readonly data?: ResolverOverview | null
    readonly isError: boolean
  },
  roles: readonly ResolverRole[],
): NodeDetailSheetProps['rolesStatus'] =>
  match(overview)
    .returnType<NodeDetailSheetProps['rolesStatus']>()
    .with({ isError: true }, () => 'error')
    .with({ data: undefined }, () => 'loading')
    // A resolver bigname has not indexed has no roles to list.
    .with({ data: null }, () => 'full')
    .with({ data: { rolesStatus: 'unsupported' } }, () => 'unsupported')
    .with({ data: P.nonNullable }, ({ data }) =>
      roles.some(isUnplaced) ? 'partial' : data.rolesStatus,
    )
    .exhaustive()
