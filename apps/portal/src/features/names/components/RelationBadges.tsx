import { match, P } from 'ts-pattern'
import { Badge } from '@/components/ui/badge'
import type { RoleCount } from '@/features/dashboard/hooks/useAddressRoleCounts'
import {
  type AddressNameRelation,
  relationLabels,
} from '@/utils/names/addressNames'

/**
 * How an address relates to a name: the number of roles it holds on an ENSv2
 * name, otherwise one badge per relation bigname reports.
 */
export const RelationBadges = ({
  relations,
  roleCount,
}: {
  readonly relations: readonly AddressNameRelation[]
  readonly roleCount?: RoleCount
}) => {
  const labels = relationLabels(relations)
  return match({ roleCount, labels })
    .with({ roleCount: P.union('loading', 'unavailable') }, ({ roleCount }) => (
      <Badge variant="outline" className="text-muted-foreground text-xs">
        {roleCount === 'loading' ? 'Counting roles…' : 'Roles unknown'}
      </Badge>
    ))
    .with({ roleCount: P.number.gt(0) }, ({ roleCount }) => (
      <Badge variant="secondary" className="text-xs">
        {roleCount} {roleCount === 1 ? 'Role' : 'Roles'}
      </Badge>
    ))
    .with({ labels: [] }, () => null)
    .otherwise(() => (
      <div className="flex flex-row gap-1">
        {labels.map((label) => (
          <Badge key={label} variant="secondary" className="text-xs">
            {label}
          </Badge>
        ))}
      </div>
    ))
}
