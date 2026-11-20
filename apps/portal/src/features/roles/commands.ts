import type {
  PaletteCommand,
  PaletteTargetMetadata,
} from '@/features/command-palette/core/types'
import { isNameTargetNotKnownAvailable } from '@/features/profile/paletteApplicability'

const canInspectRoles = (target: PaletteTargetMetadata): boolean =>
  isNameTargetNotKnownAvailable(target) && target.protocolVersion !== 'ENSv1'

export const ROLE_COMMANDS = [
  {
    id: 'name.grant-role',
    title: 'Grant role',
    icon: 'grant-role',
    keywords: ['add user', 'grant role', 'access', 'permissions', 'delegate'],
    scope: 'normal',
    group: 'Actions',
    target: 'name',
    operation: { type: 'grant-role' },
    isApplicable: canInspectRoles,
  },
  {
    id: 'name.roles',
    title: 'View roles',
    icon: 'roles',
    keywords: ['roles', 'users', 'access rights'],
    scope: 'normal',
    group: 'Navigation',
    target: 'name',
    operation: { type: 'navigate-name', to: '/$name/roles' },
    isApplicable: canInspectRoles,
  },
] as const satisfies readonly PaletteCommand[]
