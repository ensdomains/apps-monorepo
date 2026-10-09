import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { fromPromise, fromSafePromise, ok } from 'neverthrow'
import { type Address, isAddressEqual, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { dnssecOracleAbi } from '../constants'
import type { ProofSet } from '../types'
import {
  type OracleOutcome,
  type OracleRequest,
  toOracleOutcome,
} from '../utils/oracle'
import type { OracleCheckResult } from '../utils/verdict'

export class DnssecOracleError extends TaggedError('DnssecOracleError')<{
  cause: unknown
}> {}

export type OracleSupport = {
  readonly id: number
  readonly isSupported: boolean
}

export type DnssecOracleCheck = OracleCheckResult & {
  readonly address: Address
  readonly algorithms: readonly OracleSupport[]
  readonly digests: readonly OracleSupport[]
}

/**
 * Replays the chain against the onchain DNSSEC oracle, one growing prefix at
 * a time: `verifyRRSet` checks each set against the one before it, so the
 * first prefix that reverts pinpoints the link the oracle rejects. These are
 * read-only calls — nothing is submitted.
 */
export const getDnssecOracleCheck = ResultFn(async function* (
  request: OracleRequest,
) {
  const client = yield* safeGetClient()
  const address = getChainContractAddress({
    chain: sepoliaWithEns,
    contract: 'ensLegacyDnssecImpl',
  })

  const verify = (proofs: readonly ProofSet[]): Promise<OracleOutcome> =>
    fromPromise(
      readContract(client, {
        address,
        abi: dnssecOracleAbi,
        functionName: 'verifyRRSet',
        args: [proofs],
      }),
      (e) => e,
    ).match((): OracleOutcome => ({ status: 'pass' }), toOracleOutcome)

  const readSupport = (
    functionName: 'algorithms' | 'digests',
    ids: readonly number[],
  ) =>
    fromPromise(
      Promise.all(
        ids.map((id) =>
          readContract(client, {
            address,
            abi: dnssecOracleAbi,
            functionName,
            args: [id],
          }),
        ),
      ),
      (e) => new DnssecOracleError({ cause: e }),
    ).map((implementations) =>
      ids.map(
        (id, index): OracleSupport => ({
          id,
          isSupported: !isAddressEqual(implementations[index], zeroAddress),
        }),
      ),
    )

  // Start every call before awaiting any, so the transport batches them.
  const algorithmsResult = readSupport('algorithms', request.algorithms)
  const digestsResult = readSupport('digests', request.digests)
  const verificationResult = fromSafePromise(
    Promise.all([
      Promise.all(
        request.entries.map(async (entry, index) => ({
          label: entry.label,
          outcome: await verify(
            request.entries.slice(0, index + 1).map((e) => e.proof),
          ),
        })),
      ),
      Promise.all(
        request.records.map(async (record) => ({
          label: `${record.owner} TXT`,
          outcome: await verify(record.proofs),
        })),
      ),
    ]),
  )

  const [steps, records] = yield* verificationResult
  const algorithms = yield* algorithmsResult
  const digests = yield* digestsResult

  return ok<DnssecOracleCheck>({ address, steps, records, algorithms, digests })
})

const getDnssecOracleCheckQueryKey = createQueryKey<
  'dnssec-oracle-check',
  OracleRequest
>('dnssec-oracle-check')

export const getDnssecOracleCheckQueryOptions = (request: OracleRequest) =>
  resultQueryOptions({
    queryKey: getDnssecOracleCheckQueryKey(request),
    queryFn: ({ queryKey: [, p] }) => getDnssecOracleCheck(p),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  })
