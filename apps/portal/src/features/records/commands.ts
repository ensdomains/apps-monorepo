import type { PaletteCommand } from '@/features/command-palette/core/types'
import { isNameTargetNotKnownAvailable } from '@/features/profile/paletteApplicability'

export const RECORD_COMMANDS = [
  {
    id: 'name.edit-records',
    title: 'Edit records',
    icon: 'edit',
    keywords: [
      'avatar',
      'picture',
      'profile image',
      'website',
      'url',
      'email',
      'twitter',
      'social',
      'payment address',
      'receive ETH',
      'add record',
      'change address',
    ],
    scope: 'normal',
    group: 'Actions',
    target: 'name',
    operation: { type: 'navigate-name', to: '/$name/edit-records' },
    isApplicable: isNameTargetNotKnownAvailable,
  },
  {
    id: 'name.records',
    title: 'View records',
    icon: 'records',
    keywords: ['records', 'profile', 'text records', 'addresses'],
    scope: 'normal',
    group: 'Navigation',
    target: 'name',
    operation: { type: 'navigate-name', to: '/$name/records' },
    isApplicable: isNameTargetNotKnownAvailable,
  },
] as const satisfies readonly PaletteCommand[]
