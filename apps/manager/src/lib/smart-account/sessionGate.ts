/**
 * Shared decision for the registration smart-session gate.
 *
 * Both registration entry points (register-v2 `TokenPickerContent` and the v1
 * `RegistrationPage`/`useSessionGate`) use this to decide whether to prompt the
 * user to enable a smart session before starting registration.
 *
 * Rule: only the HCA (rhinestone) path uses sessions. If a session is already
 * active, proceed; otherwise the user must enable one (the single ENABLE
 * signature). The EOA-only path (no rhinestone signer) never needs a session.
 */

import type { SmartAccountContextValue } from './SmartAccountContext'

export function needsSessionBeforeRegistration(
  account: Readonly<
    Pick<SmartAccountContextValue, 'signer' | 'hasActiveSession'>
  >,
): boolean {
  return account.signer?.type === 'rhinestone' && !account.hasActiveSession
}
