import type { AiIntent } from './intent'

export type AiDialog = 'auto' | 'review' | 'primary' | 'profile' | 'bulk' | null

export const resolveAiDialog = ({
  requested,
  requiresConfirmation = false,
  intent,
  isOriginalActionReady,
  hasMultipleActions,
  canOpenProfile,
}: {
  readonly requested: AiDialog
  readonly requiresConfirmation?: boolean
  readonly intent?: AiIntent
  readonly isOriginalActionReady: boolean
  readonly hasMultipleActions: boolean
  readonly canOpenProfile: boolean
}): Exclude<AiDialog, 'auto'> => {
  if (requested === null) return null
  if (requiresConfirmation) return 'review'
  if (requested !== 'auto') return requested
  if (!isOriginalActionReady || hasMultipleActions) return 'review'
  if (intent === 'set_primary') return 'primary'
  if (intent === 'edit_profile' && canOpenProfile) return 'profile'
  return 'review'
}
