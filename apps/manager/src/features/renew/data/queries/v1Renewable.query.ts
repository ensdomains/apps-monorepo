import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  isRenewable as ensjsIsRenewable,
  type IsRenewableErrorType,
} from '@ensdomains/ensjs/public'
import { ethRegistrarIsRenewableSnippet } from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import { useQueries } from '@tanstack/react-query'
import { err, fromPromise, ok } from 'neverthrow'
import { multicall } from 'viem/actions'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { parseRenewableName } from '../../utils/renewableName'
import { getRenewerAddress } from '../../utils/renewalProtocol'

class IsV1RenewableError extends TaggedError('IsV1RenewableError')<{
  readonly cause: unknown
}> {}

export const getIsV1Renewable = ResultFn(async function* (name: string) {
  const parsedName = parseRenewableName(name)
  if (parsedName.isErr()) {
    return err(new IsV1RenewableError({ cause: parsedName.error }))
  }

  const client = yield* safeGetClient()
  const renewable = yield* fromPromise(
    ensjsIsRenewable(client, {
      renewerAddress: getRenewerAddress('v1'),
      label: parsedName.value.label,
    }),
    (cause) => new IsV1RenewableError({ cause: cause as IsRenewableErrorType }),
  )

  return ok(renewable)
})

type V1RenewableResult = Awaited<ReturnType<typeof getIsV1Renewable>>

const pendingBatches = new Map<
  string,
  Promise<Map<string, V1RenewableResult>>
>()

const loadV1RenewableBatch = async (
  names: readonly string[],
): Promise<Map<string, V1RenewableResult>> => {
  const parsedNames = names.map((name) => ({
    name,
    parsed: parseRenewableName(name),
  }))
  const results = new Map<string, V1RenewableResult>()
  const validNames = parsedNames.flatMap(({ name, parsed }) => {
    if (parsed.isOk()) return [{ name, label: parsed.value.label }]
    results.set(name, err(new IsV1RenewableError({ cause: parsed.error })))
    return []
  })

  if (validNames.length === 0) return results

  // A single name has no batching benefit and should keep its direct read.
  if (validNames.length === 1) {
    const entry = validNames[0]
    if (entry) results.set(entry.name, await getIsV1Renewable(entry.name))
    return results
  }

  const client = safeGetClient()
  if (client.isErr()) {
    for (const { name } of validNames) results.set(name, err(client.error))
    return results
  }

  const renewerAddress = getRenewerAddress('v1')
  const batch = await fromPromise(
    multicall(client.value, {
      contracts: validNames.map(({ label }) => ({
        address: renewerAddress,
        abi: ethRegistrarIsRenewableSnippet,
        functionName: 'isRenewable' as const,
        args: [label] as const,
      })),
      allowFailure: true,
      batchSize: 0,
    }),
    (cause) => new IsV1RenewableError({ cause }),
  )

  const entries = await Promise.all(
    validNames.map(async ({ name }, index) => {
      const outcome = batch.isOk() ? batch.value[index] : undefined
      // Failed entries, including a failed whole batch, fall back individually.
      const result: V1RenewableResult =
        outcome?.status === 'success'
          ? ok(outcome.result)
          : await getIsV1Renewable(name)
      return [name, result] as const
    }),
  )

  for (const [name, result] of entries) results.set(name, result)
  return results
}

/** Deduplicate simultaneous per-name queries from the same visible page. */
export const getIsV1RenewableBatch = (names: readonly string[]) => {
  const uniqueNames = [...new Set(names)]
  const batchKey = JSON.stringify(uniqueNames)
  const pending = pendingBatches.get(batchKey)
  if (pending) return pending

  const request = loadV1RenewableBatch(uniqueNames).finally(() => {
    pendingBatches.delete(batchKey)
  })
  pendingBatches.set(batchKey, request)
  return request
}

export const getV1RenewableQueryOptions = (name: string) => {
  const protocol = 'v1' as const
  const renewerAddress = getRenewerAddress(protocol)

  return resultQueryOptions({
    queryKey: $qk({
      $action: 'is-renewable',
      name,
      protocol,
      renewerAddress,
    }),
    queryFn: () => getIsV1Renewable(name),
  })
}

export const useV1Renewable = (names: readonly string[]) => {
  const uniqueNames = [...new Set(names)]
  const queries = useQueries({
    queries: uniqueNames.map((name) =>
      resultQueryOptions({
        ...getV1RenewableQueryOptions(name),
        queryFn: () =>
          fromPromise(
            getIsV1RenewableBatch(uniqueNames),
            (cause) => new IsV1RenewableError({ cause }),
          ).andThen(
            (results) =>
              results.get(name) ??
              err(new IsV1RenewableError({ cause: 'Missing batch result' })),
          ),
      }),
    ),
  })
  const renewableNames = new Set(
    uniqueNames.filter((_, index) => queries[index]?.data === true),
  )

  return {
    isLoading: queries.some((query) => query.isLoading),
    isRenewable: (name: string) => renewableNames.has(name),
  }
}
