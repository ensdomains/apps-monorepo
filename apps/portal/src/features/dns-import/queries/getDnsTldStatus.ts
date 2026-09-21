import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { type GetOwnerErrorType, getOwner } from '@ensdomains/ensjs/public/v1'
import { fromPromise, ok } from 'neverthrow'
import { type Address, isAddressEqual, zeroAddress } from 'viem'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetDnsTldStatusError extends TaggedError('GetDnsTldStatusError')<{
  cause: GetOwnerErrorType
}> {}

/**
 * Whether a DNS TLD follows the standard import path or runs a custom ENS
 * integration. All DNS TLDs are owned by the DNSRegistrar by default, but TLD
 * operators can claim their TLD node in the registry to implement custom
 * logic (`.art`, `.box`, `.hiphop`, …) — names under those cannot be imported
 * through the standard flow: `proveAndClaim` reverts on the foreign TLD node,
 * and resolution routes through the operator's registrar, not `ENS1` records.
 * See https://docs.ens.domains/dns/tlds/
 */
export type DnsTldStatus =
  | { readonly type: 'standard' }
  | { readonly type: 'custom'; readonly registrar: Address }

type GetDnsTldStatusParameters = {
  tld: string
}

export const getDnsTldStatus = ResultFn(async function* ({
  tld,
}: GetDnsTldStatusParameters) {
  const client = yield* safeGetClient()

  const ownerData = yield* fromPromise(
    getOwner(client, { name: tld, contract: 'registry' }),
    (e) => new GetDnsTldStatusError({ cause: e as GetOwnerErrorType }),
  )

  const owner = ownerData?.owner ?? null
  const dnsRegistrar = getChainContractAddress({
    chain: sepoliaWithEns,
    contract: 'ensLegacyDnsRegistrar',
  })

  // An unset TLD node is standard too: proveAndClaim enables it on first
  // claim, as long as the PublicSuffixList accepts the suffix.
  if (
    !owner ||
    isAddressEqual(owner, zeroAddress) ||
    isAddressEqual(owner, dnsRegistrar)
  ) {
    return ok<DnsTldStatus>({ type: 'standard' })
  }

  return ok<DnsTldStatus>({ type: 'custom', registrar: owner })
})

const getDnsTldStatusQueryKey = createQueryKey<
  'dns-tld-status',
  GetDnsTldStatusParameters
>('dns-tld-status')

export const getDnsTldStatusQueryOptions = (
  params: GetDnsTldStatusParameters,
) =>
  resultQueryOptions({
    queryKey: getDnsTldStatusQueryKey(params),
    queryFn: ({ queryKey: [, p] }) => getDnsTldStatus(p),
    staleTime: 1000 * 60 * 60,
  })
