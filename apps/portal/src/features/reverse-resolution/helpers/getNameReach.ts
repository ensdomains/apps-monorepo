import { match } from 'ts-pattern'
import type { NameResolver } from '@/features/records/hooks/useNameResolverAddress'

/** Whether lookups reach the resolver a forward (`setAddr`) write targets. */
export type NameReach = 'checking' | 'reachable' | 'unreachable' | 'unknown'

export const getNameReach = (query: {
  readonly status: 'pending' | 'error' | 'success'
  readonly data: NameResolver | null | undefined
}): NameReach =>
  match(query)
    .returnType<NameReach>()
    .with({ status: 'pending' }, () => 'checking')
    .with({ status: 'error' }, () => 'unknown')
    .with({ data: { source: 'v1-registry' } }, () => 'unreachable')
    .otherwise(() => 'reachable')
