import type { NameRegistrationStatus } from '@ens-apps/indexer/reads'
import { EntityBadge } from '@/components/EntityBadge'
import { Checkbox } from '@/components/ui/checkbox'
import type { RoleCount } from '@/features/dashboard/hooks/useAddressRoleCounts'
import type { AddressNameRelation } from '@/utils/names/addressNames'
import type { ProtocolVersion } from '@/utils/types'
import { NameExpiry } from './NameExpiry'
import { RelationBadges } from './RelationBadges'

export interface NameMobileCardProps {
  name: string | null
  expiryDate?: Date | null
  parentExpiryDate?: Date | null
  graceEndDate: Date | null
  status: NameRegistrationStatus
  relations?: readonly AddressNameRelation[]
  /** ENSv2 only: the roles the address holds on the name. */
  roleCount?: RoleCount
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
  parentExpiryDate,
  graceEndDate,
  status,
  relations = [],
  roleCount,
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
      <div className="text-base font-medium text-muted-foreground">Expiry</div>
      <div className="text-base">
        <NameExpiry
          expiryDate={expiryDate}
          parentExpiryDate={parentExpiryDate}
          graceEndDate={graceEndDate}
          status={status}
        />
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
          <div className="text-base font-medium text-muted-foreground">
            Roles
          </div>
          <RelationBadges relations={relations} roleCount={roleCount} />
        </>
      )}
    </div>
  )
}
