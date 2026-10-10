import type { HistoryGrantScope, RegistryRef } from '@ens-apps/indexer/bigname'

/**
 * The registry a `permission` history row changed root roles on, when the row
 * is a root role change (`RootPermissionChanged`, served after v0.4.1) that
 * names it. Such a row has no `name` and a null `registration_id`: its roles
 * apply to every resource of the registry, so the registry is its subject.
 */
export const rootPermissionRegistry = (
  scope: HistoryGrantScope | undefined,
): RegistryRef | undefined =>
  scope?.kind === 'root' ? scope.detail.registry : undefined
