import type { EnsChain } from '@ens-apps/config'
import { V1_RENEWAL_WINDOW_SECONDS } from '@ens-apps/utils/gracePeriod'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { getResolver } from '@ensdomains/ensjs/public'
import { baseRegistrarNameExpiresSnippet } from '@ensdomains/ensjs-abi/v1/baseRegistrar'
import { fromPromise, ok } from 'neverthrow'
import {
  type Client,
  hexToBigInt,
  labelhash,
  type Transport,
  zeroAddress,
} from 'viem'
import { getBlock, readContract } from 'viem/actions'
import { normalize } from 'viem/ens'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'

class IsUnreachableV1NameError extends TaggedError('IsUnreachableV1NameError')<{
  cause: unknown
}> {}

interface IsUnreachableV1NameParams {
  readonly name: string
}

const isPastV1RenewalWindow = async (
  client: Client<Transport, EnsChain>,
  label: string,
): Promise<boolean> => {
  const expiry = await getAction(
    client,
    readContract,
    'readContract',
  )({
    address: getChainContractAddress({
      chain: client.chain,
      contract: 'ensBaseRegistrarImplementation',
    }),
    abi: baseRegistrarNameExpiresSnippet,
    functionName: 'nameExpires',
    args: [hexToBigInt(labelhash(label))],
  })
  if (expiry === 0n) return false
  const { timestamp } = await getAction(client, getBlock, 'getBlock')({})
  return timestamp >= expiry + V1_RENEWAL_WINDOW_SECONDS
}

/**
 * A `.eth` name whose ENSv1 2LD is past its renewal window and that the
 * UniversalResolver no longer reaches. Its legacy registry slot can still name
 * a resolver, but a record written there never resolves.
 */
export const isUnreachableV1Name = async (
  client: Client<Transport, EnsChain>,
  name: string,
): Promise<boolean> => {
  const normalized = normalize(name)
  const labels = normalized.split('.')
  const label = labels.at(-2)
  if (labels.at(-1) !== 'eth' || !label) return false
  if (!(await isPastV1RenewalWindow(client, label))) return false
  const resolver = await getResolver(client, { name: normalized })
  return !resolver || resolver === zeroAddress
}

const getIsUnreachableV1Name = ResultFn(async function* (
  params: IsUnreachableV1NameParams,
) {
  const client = yield* safeGetClient()
  const isUnreachable = yield* fromPromise(
    isUnreachableV1Name(client, params.name),
    (cause) => new IsUnreachableV1NameError({ cause }),
  )
  return ok(isUnreachable)
})

const getIsUnreachableV1NameQueryKey = createQueryKey<
  'is-unreachable-v1-name',
  IsUnreachableV1NameParams
>('is-unreachable-v1-name')

export const getIsUnreachableV1NameQueryOptions = (
  params: IsUnreachableV1NameParams,
) =>
  resultQueryOptions({
    queryKey: getIsUnreachableV1NameQueryKey(params),
    queryFn: ({ queryKey: [, queryParams] }) =>
      getIsUnreachableV1Name(queryParams),
    staleTime: 60_000,
  })
