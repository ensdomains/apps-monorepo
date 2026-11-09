import type {
  NameCommandRoute,
  PaletteCommand,
  PaletteIcon,
  PaletteTargetMetadata,
} from '@/features/command-palette/core/types'
import { isNameTargetNotKnownAvailable } from './paletteApplicability'

const canInspectFuses = (target: PaletteTargetMetadata): boolean =>
  isNameTargetNotKnownAvailable(target) && target.protocolVersion !== 'ENSv2'

const nameNavigation = (
  id: string,
  title: string,
  icon: PaletteIcon,
  to: NameCommandRoute,
  keywords: readonly string[],
  isApplicable: NonNullable<
    PaletteCommand['isApplicable']
  > = isNameTargetNotKnownAvailable,
): PaletteCommand => ({
  id,
  title,
  icon,
  keywords,
  scope: 'normal',
  group: 'Navigation',
  target: 'name',
  operation: { type: 'navigate-name', to },
  isApplicable: to === '/$name' ? undefined : isApplicable,
})

export const NAME_COMMANDS: readonly PaletteCommand[] = [
  nameNavigation('name.view', 'View name', 'name', '/$name', [
    'name',
    'overview',
    'profile',
  ]),
  nameNavigation(
    'name.create-subname',
    'Create subname',
    'subname',
    '/$name/create-subname',
    ['subname', 'subdomain', 'create subname', 'new child name'],
  ),
  nameNavigation(
    'name.transfer',
    'Transfer name',
    'transfer',
    '/$name/ownership/transfer',
    ['transfer', 'send name', 'ownership', 'change owner'],
  ),
  nameNavigation(
    'name.change-resolver',
    'Change resolver',
    'change-resolver',
    '/$name/change-resolver',
    ['change resolver', 'set resolver'],
  ),
  nameNavigation(
    'name.resolution',
    'View address resolution',
    'resolution',
    '/$name/address',
    ['resolution', 'address resolution', 'payment addresses'],
  ),
  nameNavigation(
    'name.subnames',
    'View subnames',
    'subnames',
    '/$name/subnames',
    ['subnames', 'subdomains', 'child names'],
  ),
  nameNavigation(
    'name.ownership',
    'View ownership',
    'ownership',
    '/$name/ownership',
    ['owner', 'ownership', 'registrant', 'controller'],
  ),
  nameNavigation(
    'name.registry',
    'View registry',
    'registry',
    '/$name/registry',
    ['registry', 'registration contract'],
  ),
  nameNavigation(
    'name.resolver',
    'View resolver',
    'resolver',
    '/$name/resolver',
    ['resolver', 'resolver contract'],
  ),
  nameNavigation('name.token', 'View token', 'token', '/$name/token', [
    'token',
    'nft',
    'token id',
  ]),
  nameNavigation(
    'name.history',
    'View name history',
    'history',
    '/$name/history',
    ['history', 'events', 'transactions', 'activity'],
  ),
  nameNavigation(
    'name.fuses',
    'View fuses',
    'fuses',
    '/$name/fuses',
    ['fuses', 'name wrapper', 'restrictions'],
    canInspectFuses,
  ),
  nameNavigation(
    'name.burn-fuses',
    'Burn fuses',
    'burn',
    '/$name/fuses/burn',
    ['burn fuses', 'lock permissions', 'name wrapper restrictions'],
    canInspectFuses,
  ),
  {
    id: 'name.copy',
    title: 'Copy name',
    icon: 'copy',
    keywords: ['copy name', 'clipboard'],
    scope: 'normal',
    group: 'Actions',
    target: 'name',
    operation: { type: 'copy', value: 'name' },
  },
  {
    id: 'name.copy-namehash',
    title: 'Copy namehash',
    icon: 'hash',
    keywords: ['namehash', 'node', 'hash', 'copy node'],
    scope: 'normal',
    group: 'Actions',
    target: 'name',
    operation: { type: 'copy', value: 'namehash' },
  },
  {
    id: 'name.copy-link',
    title: 'Copy Portal link',
    icon: 'link',
    keywords: ['share', 'link', 'url', 'copy link'],
    scope: 'normal',
    group: 'Actions',
    target: 'name',
    operation: { type: 'copy', value: 'url' },
  },
]
