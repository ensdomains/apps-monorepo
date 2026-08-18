import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { fromPromise, ok } from 'neverthrow'
import { parseAbi, type ReadContractErrorType, toHex } from 'viem'
import { readContract } from 'viem/actions'
import { packetToBytes } from 'viem/ens'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'

const dnsRegistrarAbi = parseAbi(['function suffixes() view returns (address)'])

const publicSuffixListAbi = parseAbi([
  'function isPublicSuffix(bytes name) view returns (bool)',
])

export class GetIsPublicSuffixError extends TaggedError(
  'GetIsPublicSuffixError',
)<{
  cause: ReadContractErrorType
}> {}

type GetIsPublicSuffixParameters = {
  tld: string
}

/**
 * Whether the DNSRegistrar's onchain `PublicSuffixList` accepts this TLD —
 * the authoritative claimability gate. A TLD outside the list makes
 * `proveAndClaim` revert `InvalidPublicSuffix`, so the flow checks it before
 * admitting the user into the onchain path.
 */
export const getIsPublicSuffix = ResultFn(async function* ({
  tld,
}: GetIsPublicSuffixParameters) {
  const client = yield* safeGetClient()
  const registrar = getChainContractAddress({
    chain: sepoliaWithEns,
    contract: 'ensLegacyDnsRegistrar',
  })

  const isPublicSuffix = yield* fromPromise(
    readContract(client, {
      abi: dnsRegistrarAbi,
      address: registrar,
      functionName: 'suffixes',
    }).then((suffixList) =>
      readContract(client, {
        abi: publicSuffixListAbi,
        address: suffixList,
        functionName: 'isPublicSuffix',
        args: [toHex(packetToBytes(tld))],
      }),
    ),
    (e) => new GetIsPublicSuffixError({ cause: e as ReadContractErrorType }),
  )

  return ok(isPublicSuffix)
})

const getIsPublicSuffixQueryKey = createQueryKey<
  'dns-is-public-suffix',
  GetIsPublicSuffixParameters
>('dns-is-public-suffix')

export const getIsPublicSuffixQueryOptions = (
  params: GetIsPublicSuffixParameters,
) =>
  resultQueryOptions({
    queryKey: getIsPublicSuffixQueryKey(params),
    queryFn: ({ queryKey: [, p] }) => getIsPublicSuffix(p),
    staleTime: 1000 * 60 * 60,
  })
