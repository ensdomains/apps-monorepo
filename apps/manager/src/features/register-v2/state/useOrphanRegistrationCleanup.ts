/**
 * Root-mounted cleanup for a stored registration the register route can no
 * longer reach.
 *
 * See `orphanRegistrationCleanup.ts` for why this cannot live inside
 * `RegistrationV2UiProvider`.
 */

import { msg } from '@lingui/core/macro'
import { useRouterState } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { publicClient } from '@/lib/wagmi'
import { translateMessage } from '@/utils/i18n/translateMessage'
import { resolveOrphanRegistration } from '../service/orphanRegistrationCleanup'
import {
  clearStoredRegistration,
  loadStoredRegistration,
} from '../service/registrationPersistence'

const registeredMessage = msg`Your registration completed while you were away.`
const takenMessage = msg`That name was registered by someone else. You were not charged.`

export function useOrphanRegistrationCleanup(): void {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  // Latched per label so a decision is made once per stored record, not on
  // every navigation.
  const handledLabel = useRef<string | null>(null)

  useEffect(() => {
    // The register route owns its own record: its provider runs the preflight,
    // which handles both the matching label and a stale one from another name.
    if (pathname.startsWith('/register/')) return

    const stored = loadStoredRegistration()
    if (!stored) return
    if (handledLabel.current === stored.label) return

    let cancelled = false

    const run = async () => {
      const outcome = await resolveOrphanRegistration({
        stored,
        publicClient,
        chainId: publicClient.chain.id,
      })

      if (cancelled) return

      // Still in flight, or nothing submitted. Keep the record so the user can
      // come back to `/register/$name` and resume.
      if (outcome.status === 'pending') return

      handledLabel.current = stored.label
      clearStoredRegistration()

      toast(
        translateMessage(
          outcome.status === 'registered' ? registeredMessage : takenMessage,
        ),
        {
          id: `registration-orphan-${outcome.label}`,
          position: 'bottom-right',
        },
      )
    }

    // A registry read that fails leaves the record in place: the next
    // navigation retries, and keeping a resumable record is strictly safer
    // than discarding one over a transient RPC error.
    void run().catch(() => {})

    return () => {
      cancelled = true
    }
  }, [pathname])
}
