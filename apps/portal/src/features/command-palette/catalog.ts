import { canShowDnsImport } from '@/features/dns-import/paletteApplicability'
import { NAME_COMMANDS } from '@/features/profile/commands'
import { isKnownAvailableNameTarget } from '@/features/profile/paletteApplicability'
import { RECORD_COMMANDS } from '@/features/records/commands'
import { RENEW_COMMANDS } from '@/features/renew/commands'
import { ROLE_COMMANDS } from '@/features/roles/commands'
import { WALLET_COMMANDS } from '@/features/wallet/commands'
import type { PaletteCommand } from './core/types'

const GLOBAL_COMMANDS = [
  {
    id: 'navigation.dashboard',
    title: 'Dashboard',
    icon: 'home',
    keywords: ['home', 'dashboard', 'start'],
    scope: 'normal',
    group: 'Navigation',
    target: 'none',
    operation: { type: 'navigate', to: '/' },
  },
  {
    id: 'name.register',
    title: 'Register name',
    icon: 'register',
    keywords: ['register', 'buy name', 'new name', 'get name'],
    scope: 'normal',
    group: 'Actions',
    target: 'name',
    operation: { type: 'register' },
    isApplicable: isKnownAvailableNameTarget,
  },
  {
    id: 'name.import-dns',
    title: 'Import DNS name',
    icon: 'import',
    keywords: ['import', 'dns', 'dnssec', 'domain import'],
    scope: 'normal',
    group: 'Actions',
    target: 'name',
    operation: { type: 'import' },
    isApplicable: canShowDnsImport,
  },
  {
    id: 'settings.rpc',
    title: 'RPC settings',
    icon: 'settings',
    keywords: ['rpc', 'settings', 'network connection', 'provider'],
    scope: 'normal',
    group: 'Actions',
    target: 'none',
    operation: { type: 'rpc' },
  },
] as const satisfies readonly PaletteCommand[]

const ADDRESS_COMMANDS = [
  {
    id: 'address.view',
    title: 'View address',
    icon: 'wallet',
    keywords: ['address', 'wallet', 'account overview'],
    scope: 'normal',
    group: 'Navigation',
    target: 'address',
    operation: { type: 'navigate-address', to: '/addr/$addr' },
  },
  {
    id: 'address.names',
    title: 'View names',
    icon: 'names',
    keywords: ['names', 'owned names', 'portfolio'],
    scope: 'normal',
    group: 'Navigation',
    target: 'address',
    operation: { type: 'navigate-address', to: '/addr/$addr/names' },
  },
  {
    id: 'address.resolution',
    title: 'View forward resolution',
    icon: 'resolution',
    keywords: ['forward resolution', 'resolving names'],
    scope: 'normal',
    group: 'Navigation',
    target: 'address',
    operation: { type: 'navigate-address', to: '/addr/$addr/resolution' },
  },
  {
    id: 'address.reverse-resolution',
    title: 'View reverse resolution',
    icon: 'reverse-resolution',
    keywords: ['reverse resolution', 'primary names'],
    scope: 'normal',
    group: 'Navigation',
    target: 'address',
    operation: {
      type: 'navigate-address',
      to: '/addr/$addr/reverse-resolution',
    },
  },
  {
    id: 'address.history',
    title: 'View address history',
    icon: 'history',
    keywords: ['history', 'events', 'activity', 'transactions'],
    scope: 'normal',
    group: 'Navigation',
    target: 'address',
    operation: { type: 'navigate-address', to: '/addr/$addr/history' },
  },
  {
    id: 'address.copy',
    title: 'Copy this address',
    icon: 'copy',
    keywords: ['copy address', 'copy wallet address', 'clipboard'],
    scope: 'normal',
    group: 'Actions',
    target: 'address',
    operation: { type: 'copy', value: 'address' },
  },
  {
    id: 'address.copy-link',
    title: 'Copy address link',
    icon: 'link',
    keywords: ['share address', 'copy link'],
    scope: 'normal',
    group: 'Actions',
    target: 'address',
    operation: { type: 'copy', value: 'url' },
  },
] as const satisfies readonly PaletteCommand[]

const DEVELOPER_COMMANDS = [
  {
    id: 'developer.drawer',
    title: 'Open developer tools',
    icon: 'developer',
    keywords: ['developer', 'dev tools', 'qa'],
    scope: 'developer',
    group: 'Developer',
    target: 'none',
    operation: { type: 'developer', tool: 'drawer' },
  },
  {
    id: 'developer.time-travel',
    title: 'Open time travel',
    icon: 'time-travel',
    keywords: ['time', 'time travel', 'advance', 'clock'],
    scope: 'developer',
    group: 'Developer',
    target: 'none',
    operation: { type: 'developer', tool: 'time-travel' },
  },
  {
    id: 'developer.migration',
    title: 'Open migration tools',
    icon: 'migration',
    keywords: ['migration', 'migrate', 'test data'],
    scope: 'developer',
    group: 'Developer',
    target: 'none',
    operation: { type: 'developer', tool: 'migration' },
  },
  {
    id: 'developer.design-qa',
    title: 'Open design QA',
    icon: 'design-qa',
    keywords: ['design', 'qa', 'review', 'dqa'],
    scope: 'developer',
    group: 'Developer',
    target: 'none',
    operation: { type: 'developer', tool: 'design-qa' },
  },
] as const satisfies readonly PaletteCommand[]

export const PALETTE_COMMANDS: readonly PaletteCommand[] = [
  ...RECORD_COMMANDS,
  ...RENEW_COMMANDS,
  ...ROLE_COMMANDS,
  ...NAME_COMMANDS,
  ...WALLET_COMMANDS,
  ...GLOBAL_COMMANDS,
  ...ADDRESS_COMMANDS,
  ...DEVELOPER_COMMANDS,
]
