/**
 * Custom Hook: Update Account When Ready
 *
 * Syncs Rhinestone account details to the registration machine when available.
 */

// @ts-expect-error - Type imports not available
import type {
  RegistrationEvent,
  registrationMachine,
} from '@ens-apps/transaction-manager'
import { useEffect } from 'react'
import type { ActorRefFrom } from 'xstate'

interface AccountParams {
  rhinestoneAccount: any
  accountAddress: string | null
  rhinestoneConfig: any
  publicClient: any
}

export function useUpdateAccountOnReady(
  actor: ActorRefFrom<typeof registrationMachine>,
  params: AccountParams,
) {
  const { rhinestoneAccount, accountAddress, rhinestoneConfig, publicClient } =
    params

  useEffect(() => {
    const isAccountReady = Boolean(
      rhinestoneAccount && accountAddress && rhinestoneConfig && publicClient,
    )

    if (isAccountReady) {
      console.log('📤 Sending UPDATE_ACCOUNT event to machine', {
        accountAddress,
        hasRhinestoneAccount: !!rhinestoneAccount,
        hasPublicClient: !!publicClient,
        hasRhinestoneConfig: !!rhinestoneConfig,
      })

      actor.send({
        type: 'UPDATE_ACCOUNT',
        rhinestoneAccount,
        accountAddress: accountAddress as `0x${string}`,
        publicClient,
        rhinestoneConfig,
      } as RegistrationEvent)
    }
  }, [actor, rhinestoneAccount, accountAddress, publicClient, rhinestoneConfig])
}
