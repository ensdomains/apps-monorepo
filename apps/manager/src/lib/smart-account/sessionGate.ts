/**
 * Shared decision for the registration session gate.
 *
 * NOTE: "session" here is NOT ERC-7579 SmartSessions (the HCA does not install
 * that module). It is a time-boxed extra OWNER added to the HCA's
 * OwnableValidator — an ephemeral key that can sign Intents prompt-free until it
 * expires.
 *
 * Both registration entry points (register-v2 via `useSmartSessionGate` and the
 * v1 `RegistrationPage`) use this to decide whether to prompt the user to enable
 * a session before starting registration.
 *
 * Rule: only the HCA (rhinestone) path uses sessions. If a session is already
 * active, proceed; otherwise the user must enable one (the single ENABLE
 * signature). The EOA-only path (no rhinestone signer) never needs a session.
 */

import type { Address } from 'viem'
import type { SmartAccountContextValue } from './SmartAccountContext'

export function needsSessionBeforeRegistration(
  account: Readonly<
    Pick<SmartAccountContextValue, 'signer' | 'hasActiveSession'>
  >,
): boolean {
  return account.signer?.type === 'rhinestone' && !account.hasActiveSession
}

/**
 * Dedupe key for the session-hydration effect.
 *
 * MUST include BOTH the owner and the HCA `accountAddress`. On a page reload
 * mid-registration the owner address (from the connected wallet) resolves a
 * render BEFORE the HCA `accountAddress` does (the HCA must be computed/deployed
 * first). If the key were owner-only, the effect would run once while
 * `accountAddress` was still null — skipping the scoped localStorage lookup —
 * and then short-circuit on the re-run once the account arrived, leaving the
 * session un-hydrated (`hasActiveSession=false`) and re-prompting ENABLE on
 * every reload. Keying on owner+account makes the effect re-run (and actually
 * perform the lookup) once both are known.
 *
 * Returns `null` when there is no owner (nothing to hydrate).
 */
export function sessionHydrationKey(
  ownerAddress: Address | null | undefined,
  accountAddress: Address | null | undefined,
): string | null {
  const owner = ownerAddress?.toLowerCase() ?? null
  if (!owner) return null
  const account = accountAddress?.toLowerCase() ?? null
  return account ? `${owner}:${account}` : owner
}
