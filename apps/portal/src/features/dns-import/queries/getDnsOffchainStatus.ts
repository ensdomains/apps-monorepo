import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type GetDnsOffchainDataErrorType,
  getDnsOffchainData,
} from '@ensdomains/ensjs/dns'
import { getAddressRecord } from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { type Address, isAddressEqual } from 'viem'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { EXTENDED_DNS_RESOLVER_MAP } from '../constants'

export class GetDnsOffchainStatusError extends TaggedError(
  'GetDnsOffchainStatusError',
)<{
  cause: GetDnsOffchainDataErrorType
}> {}

export type DnsOffchainStatus = {
  /** Resolver address parsed (and resolved, for name forms) from the ENS1 record. */
  readonly resolverAddress: Address
  /** Whether that resolver is the official ExtendedDNSResolver for this chain. */
  readonly resolverIsOfficial: boolean
  /**
   * The address the name actually resolves to through the offchain path (a
   * live CCIP resolution), or null when resolution fails — the record exists
   * but doesn't produce an address ("resolution failure" state).
   */
  readonly resolvedAddress: Address | null
}

type GetDnsOffchainStatusParameters = {
  name: string
}

/**
 * Gasless-import verification: reads the `ENS1` TXT record on the name itself
 * (strict — typed DNS errors map to verify-step states) and, when present,
 * resolves the name's ETH address record through it. Ownership is verified
 * when the resolved address matches the connected wallet; the resolver is
 * additionally checked against the official deployment.
 */
export const getDnsOffchainStatus = ResultFn(async function* ({
  name,
}: GetDnsOffchainStatusParameters) {
  const client = yield* safeGetClient()

  const offchainData = yield* fromPromise(
    getDnsOffchainData(client, { name, strict: true }),
    (e) =>
      new GetDnsOffchainStatusError({
        cause: e as GetDnsOffchainDataErrorType,
      }),
  )

  // strict:true throws instead of returning null, but the return type keeps
  // the nullable shape — treat an (unreachable) null defensively as "no record".
  if (!offchainData) {
    return ok<DnsOffchainStatus | null>(null)
  }

  const official = EXTENDED_DNS_RESOLVER_MAP[sepoliaWithEns.id]
  const resolverIsOfficial =
    official !== undefined &&
    isAddressEqual(offchainData.resolverAddress, official)

  // Live CCIP resolution through the offchain path. A failure here is a state
  // ("record found but doesn't resolve"), not a query error.
  const record = await getAddressRecord(client, { name }).catch(() => null)

  return ok<DnsOffchainStatus | null>({
    resolverAddress: offchainData.resolverAddress,
    resolverIsOfficial,
    resolvedAddress: (record?.value as Address | undefined) ?? null,
  })
})

const getDnsOffchainStatusQueryKey = createQueryKey<
  'dns-offchain-status',
  GetDnsOffchainStatusParameters
>('dns-offchain-status')

export const getDnsOffchainStatusQueryOptions = (
  params: GetDnsOffchainStatusParameters,
) =>
  resultQueryOptions({
    queryKey: getDnsOffchainStatusQueryKey(params),
    queryFn: ({ queryKey: [, p] }) => getDnsOffchainStatus(p),
    retry: false,
    staleTime: 0,
  })
