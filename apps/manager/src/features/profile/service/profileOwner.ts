import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { universalResolverV2FindOwnerSnippet } from '@ensdomains/ensjs-abi/universalResolver'
import { fromPromise, ok } from 'neverthrow'
import { type Address, bytesToHex, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { packetToBytes } from 'viem/ens'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { normalizeEthName } from './profileName'

class GetOwnerError extends TaggedError('GetOwnerError')<{
  cause: unknown
}> {}

const UNIVERSAL_RESOLVER = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensUniversalResolver',
})

export const getOwner = ResultFn(async function* (params: { name: string }) {
  const ethName = normalizeEthName(params.name)

  if (!ethName) {
    return ok(null)
  }

  const client = yield* safeGetClient()

  // The Universal Resolver V2 walks the registry tree on-chain and returns the
  // owner of the leaf label in a single call (any depth), replacing the manual
  // per-label `getSubregistry` walk. `findOwner` is V2-only — it returns the
  // zero address for unmigrated V1 names — which matches this V2 profile view.
  const owner = yield* fromPromise(
    readContract(client, {
      address: UNIVERSAL_RESOLVER,
      abi: universalResolverV2FindOwnerSnippet,
      functionName: 'findOwner',
      args: [bytesToHex(packetToBytes(ethName.name))],
    }),
    (e) => new GetOwnerError({ cause: e }),
  )

  if (owner && owner !== zeroAddress) {
    return ok({ owner: owner as Address })
  }

  return ok(null)
})

export const profileOwnerQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'owner', { name }),
    queryFn: () => getOwner({ name }),
  })
