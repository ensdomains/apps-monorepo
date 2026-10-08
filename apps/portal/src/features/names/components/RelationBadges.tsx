import { Badge } from '@/components/ui/badge'
import {
  type AddressNameRelation,
  relationLabels,
} from '@/utils/names/addressNames'

/** How an address relates to a name, as bigname reports it, one badge each. */
export const RelationBadges = ({
  relations,
}: {
  readonly relations: readonly AddressNameRelation[]
}) => {
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
