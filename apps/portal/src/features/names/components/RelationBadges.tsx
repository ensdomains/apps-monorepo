import { Badge } from '@/components/ui/badge'
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
  readonly roleCount?: number
}) => {
  if (roleCount !== undefined && roleCount > 0)
    return (
      <Badge variant="secondary" className="text-xs">
        {roleCount} {roleCount === 1 ? 'Role' : 'Roles'}
      </Badge>
    )
  const labels = relationLabels(relations)
  if (labels.length === 0) return null
  return (
    <div className="flex flex-row gap-1">
      {labels.map((label) => (
        <Badge key={label} variant="secondary" className="text-xs">
          {label}
        </Badge>
      ))}
    </div>
  )
}
