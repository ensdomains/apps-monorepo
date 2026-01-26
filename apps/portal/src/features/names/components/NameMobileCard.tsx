import { CopyableRecord } from '@/components/CopyableRecord'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { formatDateTime } from '@/utils/formatting/formatDateTime'

export interface NameMobileCardProps {
  name: string | null
  expiryDate?: Date | null
  roleBitmap?: string | null
  recordCount?: number
  subdomainCount?: number
  isSelected?: boolean
  onSelectChange?: (selected: boolean) => void
  showCheckbox?: boolean
}

export const NameMobileCard = ({
  name,
  expiryDate,
  roleBitmap,
  recordCount,
  subdomainCount,
  isSelected = false,
  onSelectChange,
  showCheckbox = true,
}: NameMobileCardProps) => {
  const roles = roleBitmap ? decodeRoleBitmap(roleBitmap) : []
  const showRecordsSubnames =
    recordCount !== undefined || subdomainCount !== undefined

  return (
    <div className="flex flex-col gap-2 px-6 py-4 bg-white border-b border-gray-200 last:border-b-0">
      {/* Name row with checkbox, avatar and copy */}
      <div className="flex flex-row gap-3 items-center">
        {showCheckbox && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelectChange?.(!!checked)}
            aria-label="Select row"
          />
        )}
        <NameAvatar
          name={name || ''}
          height="20px"
          width="20px"
          rounded="rounded-sm"
        />
        <CopyableRecord href={`/${name}`} value={name || ''} />
      </div>

      {/* Expiry section */}
      <div className="text-sm font-medium text-gray-500">Expiry</div>
      <div className="flex items-center gap-2">
        {expiryDate ? (
          <span className="text-base">{formatDateTime(expiryDate)}</span>
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
      {roles.length > 0 && (
        <>
          <div className="text-sm font-medium text-gray-500">Roles</div>
          <div>
            <Badge variant="secondary" className="text-xs">
              {roles.length} {roles.length === 1 ? 'Role' : 'Roles'}
            </Badge>
          </div>
        </>
      )}
    </div>
  )
}
