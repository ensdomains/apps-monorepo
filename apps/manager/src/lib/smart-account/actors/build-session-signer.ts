/**
 * Build the `RhinestoneSessionContext` to attach to a `RhinestoneSigner` from
 * a stored session (owner-key model).
 *
 * The ephemeral key was added as a time-boxed HCA owner at enable time, so all
 * we need at signing time is its viem `Account` — the warp transport passes it
 * as `signers: { type: 'owner', kind: 'ecdsa', accounts: [sessionAccount] }`
 * and the SDK signs Intents with it through the normal owner validator path.
 */

import type { RhinestoneStoredSession } from '@ens-apps/smart-account'
import type { RhinestoneSessionContext } from '@ens-apps/transaction-manager'
import { privateKeyToAccount } from 'viem/accounts'

export function buildSessionContext(params: {
  readonly session: RhinestoneStoredSession
}): RhinestoneSessionContext {
  return {
    sessionAccount: privateKeyToAccount(params.session.sessionPrivateKey),
  }
}
