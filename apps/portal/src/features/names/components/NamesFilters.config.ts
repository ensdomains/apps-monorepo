import { formatRoleLabel } from '@/lib/roles/formatRoleLabel'
import { isAdminRole } from '@/lib/roles/permissions'
import { REGISTRY_ROLE_ORDER } from '@/lib/roles/registryPowerRoles'
import type { FilterGroup } from '@/utils/filtering/multiSelectFilter'

const statusFilterGroups: FilterGroup[] = [
  {
    title: 'Active',
    options: [
      { label: 'Registered', value: 'registered' },
      { label: 'Expires with parent', value: 'expires-with-parent' },
      { label: 'Does not expire', value: 'no-expiry' },
    ],
  },
  {
    title: 'Expired',
    options: [
      { label: 'Expired', value: 'expired' },
      { label: 'Grace', value: 'grace' },
      { label: 'Price cooldown', value: 'premium' },
    ],
  },
]

const lengthFilterGroups: FilterGroup[] = [
  {
    title: 'Name Length',
    options: [
      { label: '3 characters', value: '3' },
      { label: '4 characters', value: '4' },
      { label: '5+ characters', value: '5+' },
    ],
  },
]

const levelFilterGroups: FilterGroup[] = [
  {
    title: 'Name level',
    options: [
      { label: '2LDs', value: '2ld' },
      { label: 'Subnames (3LD+)', value: 'subname' },
    ],
  },
]

const roleFilterGroups: FilterGroup[] = [
  {
    title: 'ENSv1 relationships',
    options: [
      { label: 'Owner', value: 'owner' },
      { label: 'Manager', value: 'manager' },
    ],
  },

  ...[false, true].map((isAdmin) => ({
    title: isAdmin ? 'ENSv2 admin roles' : 'ENSv2 roles',
    options: REGISTRY_ROLE_ORDER.filter(
      (role) => isAdminRole(role) === isAdmin,
    ).map((role) => ({
      label: `${formatRoleLabel(role)}${isAdmin ? ' (admin)' : ''}`,
      value: `v2:${role}`,
    })),
  })),
]

export const nameFilterConfig = [
  { key: 'levels', label: 'Level', groups: levelFilterGroups },
  {
    key: 'roles',
    label: 'Roles',
    groups: roleFilterGroups,
  },
  { key: 'statuses', label: 'Status', groups: statusFilterGroups },
  { key: 'lengths', label: 'Length', groups: lengthFilterGroups },
] as const

export type NameFilter = (typeof nameFilterConfig)[number]
