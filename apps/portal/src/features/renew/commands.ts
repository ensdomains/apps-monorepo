import type {
  PaletteCommand,
  PaletteTargetMetadata,
} from '@/features/command-palette/core/types'
import { isNameTargetNotKnownAvailable } from '@/features/profile/paletteApplicability'
import { isSupportedRenewalTarget } from './utils/paletteHandoff'

const canShowRenewal = (target: PaletteTargetMetadata): boolean =>
  isNameTargetNotKnownAvailable(target) &&
  isSupportedRenewalTarget(target.entity.name)

export const RENEW_COMMANDS = [
  {
    id: 'name.renew',
    title: 'Renew name',
    icon: 'renew',
    keywords: ['renew', 'extend', 'expiry', 'expiration', 'keep registered'],
    scope: 'normal',
    group: 'Actions',
    target: 'name',
    operation: { type: 'renew' },
    isApplicable: canShowRenewal,
  },
  {
    id: 'wallet.expiring-names',
    title: 'Expiring names',
    icon: 'expiring',
    keywords: ['expiry', 'expiring', 'portfolio', 'bulk renewal', 'renew many'],
    scope: 'normal',
    group: 'Navigation',
    target: 'wallet',
    operation: { type: 'expiring-names' },
  },
] as const satisfies readonly PaletteCommand[]
