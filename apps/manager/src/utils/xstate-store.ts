import {
  createStore,
  type EventPayloadMap,
  type StoreConfig,
} from '@xstate/store'

export type PersistedStoreOptions = {
  key: string
}

export const createPersistedStore = <
  // biome-ignore lint/suspicious/noExplicitAny: Yes
  TContext extends Record<string, any>,
  TEventPayloadMap extends EventPayloadMap,
  TEmitted extends EventPayloadMap,
>(
  { context, ...rest }: StoreConfig<TContext, TEventPayloadMap, TEmitted>,
  { key }: PersistedStoreOptions,
) => {
  const persistedContext = localStorage.getItem(key)
  const initialContext = persistedContext
    ? (JSON.parse(persistedContext) as TContext)
    : context

  const store = createStore({
    context: initialContext,
    ...rest,
  })

  store.subscribe((snapshot) => {
    localStorage.setItem(key, JSON.stringify(snapshot.context))
  })

  return store
}
