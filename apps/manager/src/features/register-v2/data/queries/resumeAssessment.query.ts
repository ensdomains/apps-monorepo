import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions } from '@tanstack/react-query'
import type { Address } from 'viem'
import { publicClient } from '@/lib/wagmi'
import { assessResumableRegistration } from '../../service/assessResumableRegistration'

/**
 * The resume preflight as a query: stored record, on-chain commitment age and
 * the price re-quote — the pure-read half of resuming. The imperative tail
 * (session enable, machine dispatch) stays in `useRegistrationResume`, outside
 * the query lifecycle, where retry and refetch semantics cannot replay a
 * wallet prompt.
 */
export const getResumeAssessmentQueryOptions = (params: {
  readonly label: string
  /**
   * Not an input to the assessment — the owner check happens in the hook,
   * after the wallet has settled. In the key so that connecting a different
   * wallet re-assesses, which is also the recovery path after a failed read.
   */
  readonly ownerAddress: Address | null | undefined
  readonly signerType?: 'eoa' | 'rhinestone'
}) =>
  queryOptions({
    queryKey: $qk({
      $action: 'register-v2-resume-assessment',
      label: params.label,
      ownerAddress: params.ownerAddress ?? null,
      signerType: params.signerType ?? null,
    }),
    queryFn: () =>
      assessResumableRegistration({
        label: params.label,
        chainId: publicClient.chain.id,
        publicClient,
        signerType: params.signerType,
      }),
    // One verdict per mount. The hook acts on the settled result with a wallet
    // prompt and an XState dispatch, so a background refetch mid-tail would
    // re-run both; and a later mount must re-assess rather than act on a
    // cached verdict whose record has since progressed or been cleared.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  })
