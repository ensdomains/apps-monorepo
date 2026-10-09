import type { ResolverNode, ResolverRole } from '../hooks/useResolverOverview'

/** The grants scoped to one bound name, matched by the name bigname serves on each. */
export const rolesForNode = (
  roles: readonly ResolverRole[],
  node: Pick<ResolverNode, 'name'>,
): readonly ResolverRole[] =>
  roles.filter((role) => role.name?.toLowerCase() === node.name.toLowerCase())
