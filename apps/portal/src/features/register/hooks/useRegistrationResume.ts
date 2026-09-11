/**
 * Resume an interrupted registration on its name's page.
 *
 * The pure reads (stored record, commitment age) run through TanStack Query;
 * this hook owns the imperative tail, the owner gate and the one-shot RESUME,
 * kept outside the query lifecycle so a refetch can never replay a dispatch.
 *
 * Auto-resumes rather than asking: the user came back to this name's page, and
 * a confirmation in front of a flow they already paid to start is friction
 * without a decision behind it.
 */

import type {
  EOASigner,
  PersistedRegistrationRecord,
} from '@ens-apps/transaction-manager'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { getWalletClient } from '@wagmi/core/actions'
import { fromPromise, ok } from 'neverthrow'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { useConfig, useConnection } from 'wagmi'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import type { PaymentToken } from '../constants/paymentTokens'
import {
  clearStoredRegistration,
  loadStoredRegistration,
} from '../utils/registrationPersistence'
import {
  assessRegistrationResume,
  decideRegistrationResume,
  type RegistrationResumeDecision,
} from '../utils/registrationResume'

type RegistrationResumeParameters = {
  readonly name: string
  /**
   * Not an input to the assessment: the owner check happens in the hook. In the
   * key so that connecting a different wallet re-assesses.
   */
  readonly ownerAddress: Address | null
}

const assessStoredRegistration = ResultFn(async function* ({
  name,
}: RegistrationResumeParameters) {
  const client = yield* safeGetClient()

  return ok(
    await assessRegistrationResume({
      name,
      chainId: sepoliaWithEns.id,
      client,
      record: loadStoredRegistration(),
    }),
  )
})

const registrationResumeQueryKey = createQueryKey<
  'registration-resume',
  RegistrationResumeParameters
>('registration-resume')

export const getRegistrationResumeQueryOptions = (
  params: RegistrationResumeParameters,
) => ({
  ...resultQueryOptions({
    queryKey: registrationResumeQueryKey(params),
    queryFn: ({ queryKey: [, variables] }) =>
      assessStoredRegistration(variables),
  }),
  // One verdict per mount. The hook acts on it with a dispatch, so a background
  // refetch must not re-run it, and a later mount must re-read storage rather
  // than act on a verdict whose record has since moved on.
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: 0,
})

export type ResumableRun = {
  readonly record: PersistedRegistrationRecord
  readonly token: PaymentToken
  readonly signer: EOASigner
}

export type RegistrationResumeState =
  | { readonly status: 'idle' }
  /** A live run for this name, and no wallet connected: name the one it needs. */
  | { readonly status: 'await-owner'; readonly owner: Address }

const IDLE: RegistrationResumeState = { status: 'idle' }

const resumingMessage = 'Resuming your registration.'
const expiredMessage =
  'Your previous registration attempt expired. Starting over.'

/**
 * Act on a decision that needs no wallet. `final` marks it decided for this
 * name; waiting on the owner and hiding from another wallet stay open, so
 * connecting the owner re-keys the query and the resume picks up when it does.
 */
const settleDecision = (
  decision: Exclude<RegistrationResumeDecision, { kind: 'resume' }>,
): { readonly final: boolean; readonly awaitingOwner?: Address } =>
  match(decision)
    .with({ kind: 'none' }, () => ({ final: true }))
    .with({ kind: 'discard' }, ({ notify }) => {
      clearStoredRegistration()
      if (notify) toast(expiredMessage)
      return { final: true }
    })
    .with({ kind: 'await-owner' }, ({ owner }) => ({
      final: false,
      awaitingOwner: owner,
    }))
    .with({ kind: 'hide' }, () => ({ final: false }))
    .exhaustive()

export const useRegistrationResume = ({
  name,
  onResume,
}: {
  readonly name: string
  /**
   * Re-enter the run. Returns false when it could not, because a registration
   * already started on this page; the record is then left alone.
   */
  readonly onResume: (run: ResumableRun) => boolean
}): RegistrationResumeState => {
  const config = useConfig()
  const { address, isConnecting, isReconnecting } = useConnection()

  // Tagged with the name it was decided for: `RegisterName` stays mounted when
  // the name in the URL changes.
  const [awaiting, setAwaiting] = useState<{
    readonly name: string
    readonly owner: Address
  } | null>(null)

  // One decision per name, so a re-render can never dispatch a second RESUME
  // into a run that is already going.
  const decidedFor = useRef<string | null>(null)

  const onResumeRef = useRef(onResume)
  useEffect(() => {
    onResumeRef.current = onResume
  })

  const { data: verdict } = useQuery({
    ...getRegistrationResumeQueryOptions({
      name,
      ownerAddress: address ?? null,
    }),
    // Assessing mid-restore would read "no wallet" for the owner themself.
    enabled: !isConnecting && !isReconnecting,
  })

  useEffect(() => {
    if (!verdict || decidedFor.current === name) return

    const decision = decideRegistrationResume(verdict, address)

    if (decision.kind !== 'resume') {
      const { final, awaitingOwner } = settleDecision(decision)
      if (final) decidedFor.current = name
      setAwaiting(awaitingOwner ? { name, owner: awaitingOwner } : null)
      return
    }
    setAwaiting(null)

    let cancelled = false

    void fromPromise(
      getWalletClient(config, { account: address }),
      (error) => error,
    ).match(
      (walletClient) => {
        if (cancelled) return
        const { record, token } = decision.verdict
        if (
          !onResumeRef.current({
            record,
            token,
            signer: createEOASigner(walletClient),
          })
        ) {
          return
        }
        decidedFor.current = name
        toast(resumingMessage)
      },
      (error) => {
        // Stay un-latched: the record is still valid, and a reconnect retries.
        console.warn('Resuming the registration failed:', error)
      },
    )

    return () => {
      cancelled = true
    }
  }, [verdict, address, name, config])

  return awaiting?.name === name
    ? { status: 'await-owner', owner: awaiting.owner }
    : IDLE
}
