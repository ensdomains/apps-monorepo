export type PushProposalState =
  | 'default'
  | 'checking'
  | 'unavailable'
  | 'unsupported'
  | 'blocked'
  | 'already_enabled'
  | 'already_disabled'
  | 'enable'
  | 'disable'

/** A proposed direction never exposes a control that performs its opposite. */
export const getPushProposalState = ({
  proposedEnabled,
  isEnabled,
  isSupported,
  permission,
  isFetching,
  isError,
}: {
  readonly proposedEnabled?: boolean
  readonly isEnabled: boolean
  readonly isSupported: boolean
  readonly permission: NotificationPermission
  readonly isFetching: boolean
  readonly isError: boolean
}): PushProposalState => {
  if (proposedEnabled === undefined) return 'default'
  if (isFetching) return 'checking'
  if (isError) return 'unavailable'
  if (!isSupported) return 'unsupported'
  if (proposedEnabled === isEnabled)
    return isEnabled ? 'already_enabled' : 'already_disabled'
  if (!proposedEnabled) return 'disable'
  return permission === 'denied' ? 'blocked' : 'enable'
}
