import type { UserNotificationSettings } from '@ens-apps/shared-schema/notifications'

export type PreferenceProposal = {
  readonly key: keyof UserNotificationSettings
  readonly enabled: boolean
}

const keys = [
  'ownedNameExpiry',
  'favouritedNameExpiry',
  'ensLabsUpdates',
] as const

export const getPreferenceChanges = (
  baseline: UserNotificationSettings,
  values: UserNotificationSettings,
): Partial<UserNotificationSettings> =>
  Object.fromEntries(
    keys
      .filter((key) => baseline[key] !== values[key])
      .map((key) => [key, values[key]]),
  )

export const getPreferenceProposalValues = (
  settings: UserNotificationSettings,
  proposal: PreferenceProposal | undefined,
  proposalSessionId: string | undefined,
  currentSessionId: string,
): UserNotificationSettings =>
  proposal && proposalSessionId === currentSessionId
    ? { ...settings, [proposal.key]: proposal.enabled }
    : { ...settings }
