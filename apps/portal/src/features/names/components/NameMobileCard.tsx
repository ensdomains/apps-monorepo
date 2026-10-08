import { EntityBadge } from '@/components/EntityBadge'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { GraceBadge } from '@/features/profile/components/GraceBadge'
import { getNameStatus } from '@/features/renew/utils/nameExtension'
import { formatDateTime } from '@/utils/formatting/formatDateTime'
import type { AddressNameRelation } from '@/utils/names/addressNames'
import { dateToPlainDate } from '@/utils/temporal'
import type { ProtocolVersion } from '@/utils/types'
import { RelationBadges } from './RelationBadges'

export interface NameMobileCardProps {
  name: string | null
  expiryDate?: Date | null
  relations?: readonly AddressNameRelation[]
  protocolVersion: ProtocolVersion
  recordCount?: number
  subdomainCount?: number
  isSelected?: boolean
  onSelectChange?: (selected: boolean) => void
  showCheckbox?: boolean
}

export const NameMobileCard = ({
  name,
  expiryDate,
  relations = [],
  protocolVersion,
  recordCount,
  subdomainCount,
  isSelected = false,
  onSelectChange,
  showCheckbox = true,
}: NameMobileCardProps) => {
  const hasRoles = relations.length > 0
  const showRecordsSubnames =
    recordCount !== undefined || subdomainCount !== undefined

  return (
    <div className="flex flex-col gap-2 px-6 py-4 bg-background border-b border-border last:border-b-0">
      {/* Name row with checkbox, avatar and copy */}
      <div className="flex flex-row gap-3 items-center">
        {showCheckbox && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelectChange?.(!!checked)}
            aria-label="Select row"
          />
        )}
        <EntityBadge variant="name" name={name ?? undefined} showAvatar>
          {name}
        </EntityBadge>
      </div>

      {/* Expiry section */}
      <div className="text-sm font-medium text-muted-foreground">Expiry</div>
      <div className="flex items-center gap-2">
        {expiryDate ? (
          <>
            <span className="text-base">
              {formatDateTime(dateToPlainDate(expiryDate))}
            </span>
            {getNameStatus(expiryDate, protocolVersion === 'ENSv2') ===
              'grace' && <GraceBadge />}
          </>
        ) : (
          <Badge variant="secondary" className="text-xs">
            Does not expire
          </Badge>
        )}
      </div>

      {/* Records and Subnames row (for overview page) */}
      {showRecordsSubnames && (
        <div className="flex gap-4 text-base">
          <div>
            <span className="font-medium">Records</span>{' '}
            <span>{recordCount ?? 0}</span>
          </div>
          <div>
            <span className="font-medium">Subnames</span>{' '}
            <span>{subdomainCount ?? 0}</span>
          </div>
        </div>
      )}

      {/* Roles section (for names page) */}
      {hasRoles && (
        <>
          <div className="text-sm font-medium text-muted-foreground">Roles</div>
          <RelationBadges relations={relations} />
        </>
      )}
    </div>
  )
}
