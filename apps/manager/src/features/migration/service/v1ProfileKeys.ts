import {
  isAddressOnlyResolver,
  isKnownPublicResolver,
} from '@ens-apps/migration'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { supportedL1Chains } from '@ensdomains/ensjs/chain'
import { err, ok, ResultAsync } from 'neverthrow'
import type { Address, Hex, PublicClient } from 'viem'
import { envConfig } from '@/config'
import { checkNotAborted } from './bignameLookup'
import { readV1ResolverHistory } from './readV1ResolverHistory'
import { profileKeysForSource } from './v1ResolverHistory'

export type V1ProfileKeys = {
  readonly id: string
  readonly texts: readonly string[]
  readonly coinTypes: readonly bigint[]
  readonly hasContentHash: boolean
  readonly abiContentTypes: readonly bigint[]
  readonly interfaceIds: readonly Hex[]
  readonly hasName?: boolean
}

/** A name whose records are read from the ENSv1 resolver it points at. */
export type V1ProfileSource = {
  /** The name's namehash. */
  readonly id: string
  readonly name: string
  readonly resolver: Address
}

export class GetV1ProfilesError extends TaggedError('GetV1ProfilesError')<{
  readonly cause: unknown
}> {}

/** Supported immutable resolvers emit every variable key; singleton values are probed separately. */
export const getV1ProfileKeys = ResultFn(async function* (
  sources: readonly V1ProfileSource[],
  options: {
    readonly publicClient: Pick<PublicClient, 'request'>
    readonly signal?: AbortSignal
    readonly onNamesRead?: (names: readonly string[]) => void | Promise<void>
    readonly chainId?: number
  },
) {
  const toError = (cause: unknown) => new GetV1ProfilesError({ cause })
  yield* checkNotAborted(options.signal, toError)
  const chainId = options.chainId ?? envConfig.chain.id
  if (
    chainId !== supportedL1Chains.mainnet &&
    chainId !== supportedL1Chains.sepolia
  )
    return err(toError(new Error('Unsupported resolver history network')))
  const unsupported = sources.find(
    ({ resolver }) =>
      !isKnownPublicResolver(resolver, chainId) &&
      !isAddressOnlyResolver(resolver, chainId),
  )
  if (unsupported)
    return err(
      toError(
        new Error(
          `The record inventory for "${unsupported.name}" cannot be certified for its resolver`,
        ),
      ),
    )

  const history = yield* readV1ResolverHistory({
    sources: sources.filter(
      ({ resolver }) => !isAddressOnlyResolver(resolver, chainId),
    ),
    publicClient: options.publicClient,
    chainId,
    signal: options.signal,
  }).mapErr(({ cause }) => toError(cause))
  yield* checkNotAborted(options.signal, toError)

  const keys = sources.map(
    (source): V1ProfileKeys =>
      isAddressOnlyResolver(source.resolver, chainId)
        ? {
            id: source.id.toLowerCase(),
            texts: [],
            coinTypes: [60n],
            hasContentHash: false,
            abiContentTypes: [],
            interfaceIds: [],
            // V2 cannot replay name records. Probe even without emitted history.
            hasName: true,
          }
        : profileKeysForSource(source, history),
  )
  if (sources.length > 0 && options.onNamesRead) {
    yield* ResultAsync.fromThrowable(
      async () => options.onNamesRead?.(sources.map(({ name }) => name)),
      toError,
    )()
    yield* checkNotAborted(options.signal, toError)
  }
  return ok(keys)
})
