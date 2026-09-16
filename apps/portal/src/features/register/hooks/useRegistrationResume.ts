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
import { useEffect, useReducer, useRef, useState } from 'react'
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
  isSameAddress,
  type RegistrationResumeDecision,
} from '../utils/registrationResume'

type RegistrationResumeParameters = {
  readonly name: string
  /**
   * Not an input to the assessment: the owner check happens in the hook. In the
   * key so that connecting a different wallet re-assesses.
   */
  readonly ownerAddress: Address | null
  /**
   * Counts suspends on this page. A verdict from before one can predate the
   * record the suspended run wrote, so each suspend asks again.
   */
  readonly generation: number
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
  /** See the resumable verdict: false keeps the commit step ahead. */
  readonly commitmentOnChain: boolean
}

export type RegistrationResumeState =
  | { readonly status: 'idle' }
  /** A live run for this name, and no wallet connected: name the one it needs. */
  | { readonly status: 'await-owner'; readonly owner: Address }

const IDLE: RegistrationResumeState = { status: 'idle' }

/**
 * How long a disconnect must last before it stops a live run: long enough to
 * ride out a connector that reports one while it reconnects.
 */
export const DISCONNECT_GRACE_MS = 2_000

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
  suspendableRunOwner,
  onSuspend,
}: {
  readonly name: string
  /**
   * Re-enter the run. Returns false when it could not, because a registration
   * already started on this page; the record is then left alone.
   */
  readonly onResume: (run: ResumableRun) => boolean
  /**
   * The wallet a run on this page belongs to, while stopping it still protects
   * something. See `useRegistrationTransactions`.
   */
  readonly suspendableRunOwner?: Address
  /** Stop the live run, keeping its record for the owner to resume. */
  readonly onSuspend: () => void
}): RegistrationResumeState => {
  const config = useConfig()
  const { address, isConnecting, isReconnecting, isDisconnected } =
    useConnection()

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
  const onSuspendRef = useRef(onSuspend)
  useEffect(() => {
    onResumeRef.current = onResume
    onSuspendRef.current = onSuspend
  })

  // Bumped by a suspend, which re-keys the assessment and runs the decision
  // below again.
  const [suspensions, countSuspension] = useReducer((n: number) => n + 1, 0)

  const { data: verdict } = useQuery({
    ...getRegistrationResumeQueryOptions({
      name,
      ownerAddress: address ?? null,
      generation: suspensions,
    }),
    // Assessing mid-restore would read "no wallet" for the owner themself.
    enabled: !isConnecting && !isReconnecting,
  })

  // A live run belongs to the wallet that started it. When that wallet is gone
  // the run stops, as a closed tab would, and its record stays for the owner:
  // otherwise it carries on with the signer it captured, under whichever
  // wallet the page now shows. A different wallet suspends at once; a
  // disconnect waits out a grace period and only counts when wagmi says so,
  // since the address alone reads empty for a moment during reconnects.
  useEffect(() => {
    if (!suspendableRunOwner) return

    const suspend = () => {
      onSuspendRef.current()
      decidedFor.current = null
      countSuspension()
    }

    if (address && !isSameAddress(suspendableRunOwner, address)) {
      suspend()
      return
    }

    if (isDisconnected) {
      const timer = setTimeout(suspend, DISCONNECT_GRACE_MS)
      return () => clearTimeout(timer)
    }
  }, [suspendableRunOwner, address, isDisconnected])

  // biome-ignore lint/correctness/useExhaustiveDependencies: `suspensions` re-runs the decision after a suspend
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
        const { record, token, commitmentOnChain } = decision.verdict
        if (
          !onResumeRef.current({
            record,
            token,
            signer: createEOASigner(walletClient),
            commitmentOnChain,
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
  }, [verdict, address, name, config, suspensions])

  return awaiting?.name === name
    ? { status: 'await-owner', owner: awaiting.owner }
    : IDLE
}
