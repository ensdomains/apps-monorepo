import { TaggedError } from '@ens-apps/utils/neverthrow'
import {
  type Address,
  createPublicClient,
  custom,
  type PublicClient,
} from 'viem'
import {
  getUpgradeReadPlan,
  getUpgradeReadReuseKey,
  observeUpgradeReadHeader,
  type UpgradeReadObservations,
  type UpgradeReadRequest,
} from './upgradeReadPolicy'

export type UpgradeReadClients = {
  readonly publicClient: PublicClient
  readonly verificationClient: PublicClient
}
export type UpgradeReadCoordinator = {
  readonly run: <T>(
    params: {
      readonly owner: Address
      readonly signal: AbortSignal
      readonly mode?: 'live' | 'after-renewal'
    },
    operation: (clients: UpgradeReadClients) => Promise<T>,
  ) => Promise<T>
  readonly dispose: () => void
}
class UpgradeReadError extends TaggedError('UpgradeReadError')<{
  readonly cause: unknown
}> {}
const stopped = () =>
  new UpgradeReadError({
    message: 'Upgrade preparation was cancelled',
    cause: undefined,
  })

const withCancellation = <T>(
  promise: Promise<T>,
  signal: AbortSignal,
  leave: () => void = () => undefined,
): Promise<T> => {
  if (signal.aborted) {
    leave()
    return Promise.reject(signal.reason)
  }
  return new Promise<T>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', onAbort)
      leave()
    }
    const onAbort = () => {
      finish()
      reject(signal.reason)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        finish()
        if (!signal.aborted) resolve(value)
      },
      (cause: unknown) => {
        finish()
        reject(cause)
      },
    )
  })
}

type PendingRead = {
  readonly promise: Promise<unknown>
  readonly controller: AbortController
  readonly subscribe: (signal: AbortSignal) => Promise<unknown>
}
type Forward = (
  request: UpgradeReadRequest,
  signal: AbortSignal,
) => Promise<unknown>

const createReadScope = (forward: Forward) => {
  let serial = 0
  let observations: UpgradeReadObservations = {
    generation: 0,
    order: 0,
    head: null,
    headers: new Map(),
  }
  let completed: ReadonlyMap<string, unknown> = new Map()
  let pending: ReadonlyMap<string, PendingRead> = new Map()
  const request = async (
    input: unknown,
    signal: AbortSignal,
    verification: boolean,
  ): Promise<unknown> => {
    signal.throwIfAborted()
    const plan = getUpgradeReadPlan(input)
    if (plan.status === 'unsupported')
      return Promise.reject(
        new UpgradeReadError({
          message: 'The upgrade coordinator only accepts read methods',
          cause: input,
        }),
      )
    const reuseKey = verification
      ? null
      : getUpgradeReadReuseKey(plan, observations.headers)
    if (reuseKey && completed.has(reuseKey))
      return Promise.resolve(structuredClone(completed.get(reuseKey)))
    serial += 1
    const key =
      !verification && plan.canShare
        ? JSON.stringify([observations.generation, plan.key, reuseKey])
        : `fresh:${serial}`
    const existing = pending.get(key)
    if (existing) return existing.subscribe(signal)
    const controller = new AbortController()
    const startedGeneration = observations.generation
    const order = serial
    let consumers = 0
    let settled = false
    const promise: Promise<unknown> = Promise.resolve()
      .then(() => {
        controller.signal.throwIfAborted()
        return forward(structuredClone(plan.request), controller.signal)
      })
      .then((value) => {
        controller.signal.throwIfAborted()
        const previousGeneration = observations.generation
        observations = observeUpgradeReadHeader(observations, {
          request: plan.request,
          response: value,
          order,
          generation: startedGeneration,
        })
        if (observations.generation !== previousGeneration)
          completed = new Map()
        if (reuseKey && observations.generation === startedGeneration)
          completed = new Map([
            ...completed,
            [reuseKey, structuredClone(value)],
          ])
        return value
      })
      .finally(() => {
        settled = true
        if (pending.get(key)?.promise === promise)
          pending = new Map([...pending].filter(([entry]) => entry !== key))
      })
    const subscribe = (consumerSignal: AbortSignal): Promise<unknown> => {
      consumers += 1
      let hasLeft = false
      return withCancellation(promise, consumerSignal, () => {
        if (hasLeft) return
        hasLeft = true
        consumers -= 1
        if (consumers === 0 && !settled) {
          controller.abort(stopped())
          if (pending.get(key)?.promise === promise)
            pending = new Map([...pending].filter(([entry]) => entry !== key))
        }
      }).then((value) => structuredClone(value))
    }
    pending = new Map([...pending, [key, { promise, controller, subscribe }]])
    void promise.catch(() => undefined)
    return subscribe(signal)
  }
  return {
    request,
    clear: () => {
      observations = {
        generation: observations.generation + 1,
        order: serial,
        head: null,
        headers: new Map(),
      }
      for (const { controller } of pending.values()) controller.abort(stopped())
      pending = new Map()
      completed = new Map()
    },
  }
}

const bindClient = (
  base: PublicClient,
  read: (
    input: unknown,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<unknown>,
): PublicClient => {
  const transport = custom({ request: read }, { retryCount: 0 })
  const coordinatedTransport: typeof transport = (parameters) => ({
    ...transport(parameters),
    request: read,
  })
  return createPublicClient({
    chain: base.chain,
    batch: base.batch,
    ccipRead: base.ccipRead,
    experimental_blockTag: base.experimental_blockTag,
    cacheTime: 0,
    pollingInterval: base.pollingInterval,
    key: base.key,
    name: base.name,
    tokens: base.tokens,
    // Actions must bind to this request. Bypass the adapter's SDK dedupe too:
    // a verification getBlock otherwise joins an identical pending request.
    transport: coordinatedTransport,
  })
}

export const createUpgradeReadCoordinator = (deps: {
  readonly publicClient: PublicClient
}): UpgradeReadCoordinator => {
  let scopes: ReadonlyMap<
    string,
    ReturnType<typeof createReadScope>
  > = new Map()
  let active: ReadonlySet<AbortController> = new Set()
  return {
    run: async (params, operation) => {
      params.signal.throwIfAborted()
      const lifetime = new AbortController()
      const signal = AbortSignal.any([params.signal, lifetime.signal])
      active = new Set([...active, lifetime])
      // Viem's provider adapter is the unknown RPC boundary; its raw config
      // forwards exactly to the original typed client's request with no wrapper.
      const forward = custom(deps.publicClient, { retryCount: 0 })({
        chain: deps.publicClient.chain,
      }).config.request
      const key = JSON.stringify([
        params.owner.toLowerCase(),
        params.mode ?? 'live',
      ])
      const scope =
        scopes.get(key) ??
        createReadScope((request, requestSignal) =>
          forward(request, { signal: requestSignal, dedupe: false }),
        )
      scopes = new Map([...scopes, [key, scope]])
      const client = (verification: boolean) =>
        bindClient(deps.publicClient, (input, options) =>
          scope.request(
            input,
            options?.signal
              ? AbortSignal.any([signal, options.signal])
              : signal,
            verification,
          ),
        )
      try {
        return await withCancellation(
          operation({
            publicClient: client(false),
            verificationClient: client(true),
          }),
          signal,
        )
      } finally {
        lifetime.abort(stopped())
        active = new Set(
          [...active].filter((controller) => controller !== lifetime),
        )
      }
    },
    dispose: () => {
      for (const controller of active) controller.abort(stopped())
      active = new Set()
      for (const scope of scopes.values()) scope.clear()
      scopes = new Map()
    },
  }
}
