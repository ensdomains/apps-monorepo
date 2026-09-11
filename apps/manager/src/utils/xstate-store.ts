import {
  createStore,
  type EventObject,
  type EventPayloadMap,
  type StoreConfig,
  type StoreContext,
  type StoreExtension,
  type StoreSnapshot,
} from '@xstate/store-react'
import * as v from 'valibot'

export type PersistedContextSchema<TContext> = v.GenericSchema<
  unknown,
  TContext
>

export type PersistedStoreOptions<TContext> = {
  readonly key: string
  readonly schema: PersistedContextSchema<NoInfer<TContext>>
}

const getDefaultStorage = (): Storage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

export const createPersistedStore = <
  // biome-ignore lint/suspicious/noExplicitAny: Yes
  TContext extends Record<string, any>,
  TEventPayloadMap extends EventPayloadMap,
  TEmitted extends EventPayloadMap,
>(
  { context, ...rest }: StoreConfig<TContext, TEventPayloadMap, TEmitted>,
  { key, schema }: PersistedStoreOptions<TContext>,
) => {
  const storage = getDefaultStorage()
  const initialContext = parsePersistedContext({
    key,
    raw: storage?.getItem(key),
    schema,
    fallback: context,
  })

  const store = createStore({
    context: initialContext,
    ...rest,
  })

  store.subscribe((snapshot) => {
    storage?.setItem(key, JSON.stringify(snapshot.context))
  })

  return store
}

type PersistOptions<TContext extends StoreContext> = {
  readonly name: string
  readonly schema: PersistedContextSchema<NoInfer<TContext>>
  readonly serde?: {
    readonly serialize: (value: unknown) => string
    readonly deserialize: (value: string) => unknown
  }
  readonly storage?: Storage
}

const DEFAULT_SERDE = {
  serialize: JSON.stringify,
  deserialize: JSON.parse,
}

const validatePersistedContext = <TContext>(
  key: string,
  context: unknown,
  schema: PersistedContextSchema<TContext>,
  fallback: TContext,
): TContext => {
  const result = v.safeParse(schema, context)
  if (!result.success) {
    console.warn(`Persisted state for key "${key}" failed schema validation`)
    return fallback
  }

  return result.output
}

const parsePersistedContext = <TContext>({
  key,
  raw,
  schema,
  fallback,
}: {
  readonly key: string
  readonly raw: string | undefined | null
  readonly schema: PersistedContextSchema<TContext>
  readonly fallback: TContext
}): TContext => {
  if (!raw) return fallback

  try {
    return validatePersistedContext(
      key,
      DEFAULT_SERDE.deserialize(raw),
      schema,
      fallback,
    )
  } catch (error) {
    console.warn(`Failed to load persisted state for key "${key}":`, error)
    return fallback
  }
}

const getSnapshotContext = (persisted: unknown): unknown => {
  if (
    !persisted ||
    typeof persisted !== 'object' ||
    !('context' in persisted)
  ) {
    return undefined
  }

  return persisted.context
}

function loadPersistedState<TContext extends StoreContext>(
  key: string,
  storage: Storage,
  serde: PersistOptions<TContext>['serde'],
  schema: PersistedContextSchema<TContext>,
  fallbackContext: TContext,
): TContext {
  try {
    const serialized = storage.getItem(key)
    if (!serialized) {
      return fallbackContext
    }

    const { deserialize } = serde || DEFAULT_SERDE
    const context = getSnapshotContext(deserialize(serialized))
    if (context === undefined) {
      return fallbackContext
    }

    return validatePersistedContext(key, context, schema, fallbackContext)
  } catch (error) {
    console.warn(`Failed to load persisted state for key "${key}":`, error)
    return fallbackContext
  }
}

function savePersistedState<TContext extends StoreContext>(
  key: string,
  snapshot: StoreSnapshot<TContext>,
  serde: PersistOptions<TContext>['serde'],
  storage: Storage,
): void {
  try {
    const { serialize } = serde || DEFAULT_SERDE
    const serialized = serialize(snapshot)
    storage.setItem(key, serialized)
  } catch (error) {
    console.warn(`Failed to save persisted state for key "${key}":`, error)
  }
}

/**
 * Adds persistence functionality to xstate store logic.
 *
 * @example
 * // Using with .with() (recommended)
 * ```ts
 * const store = createStore({
 *   context: { count: 0 },
 *   on: {
 *     inc: (ctx) => ({ count: ctx.count + 1 })
 *   }
 * }).with(persist({ name: 'my-store-key', schema: v.object({ count: v.number() }) }));
 * ```
 *
 * @example
 * // Using sessionStorage instead of localStorage
 * ```ts
 * const store = createStore({
 *   context: { foo: 'bar' },
 *   on: { update: (ctx, e) => ({ foo: e.value }) }
 * }).with(persist({ name: 'example-session', schema: v.object({ foo: v.string() }), storage: window.sessionStorage }));
 * ```
 *
 * @example
 * // Using custom serde (serialization/deserialization)
 * ```ts
 * const customSerde = {
 *   serialize: (snapshot) => btoa(JSON.stringify(snapshot)),
 *   deserialize: (str) => JSON.parse(atob(str)),
 * };
 *
 * const store = createStore({
 *   context: { foo: 'bar' },
 *   on: { update: (ctx, e) => ({ foo: e.value }) }
 * }).with(persist({ name: 'encoded-store', schema: v.object({ foo: v.string() }), serde: customSerde }));
 * ```
 *
 * @param options PersistOptions for customizing storage, serialization, and key.
 * @returns Store extension providing state persistence.
 */
export const persist = <
  TContext extends StoreContext,
  TEventPayloadMap extends EventPayloadMap,
  TEmitted extends EventObject,
>(
  options: PersistOptions<TContext>,
): StoreExtension<
  TContext,
  TEventPayloadMap,
  Record<string, never>,
  TEmitted
> => {
  const storage = options.storage ?? getDefaultStorage()

  return (logic) => {
    if (!storage) return logic

    return {
      getInitialSnapshot() {
        const initialSnapshot = logic.getInitialSnapshot()

        return {
          ...initialSnapshot,
          context: loadPersistedState(
            options.name,
            storage,
            options.serde,
            options.schema,
            initialSnapshot.context,
          ),
        }
      },
      transition(snapshot, event) {
        const [nextState, effects] = logic.transition(snapshot, event)
        savePersistedState(options.name, nextState, options.serde, storage)
        return [nextState, effects]
      },
    }
  }
}
