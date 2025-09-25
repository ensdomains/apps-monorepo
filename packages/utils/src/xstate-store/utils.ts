import type {EventPayloadMap, StoreConfig, StoreSnapshot, ExtractEvents, EmitsFromStoreConfig, StoreLogic } from '@xstate/store';
import { createStoreTransition } from '@xstate/store';

export type StoreContext = Record<string, any>;

export function storeConfigToLogic<
  TContext extends StoreContext,
  TEventPayloadMap extends EventPayloadMap,
  TEmittedPayloadMap extends EventPayloadMap
>(
  storeConfig: StoreConfig<TContext, TEventPayloadMap, TEmittedPayloadMap>
): StoreLogic<
  StoreSnapshot<TContext>,
  ExtractEvents<TEventPayloadMap>,
  EmitsFromStoreConfig<any>
> {
  return {
    getInitialSnapshot: () => ({
      status: 'active',
      context: storeConfig.context,
      output: undefined,
      error: undefined
    }),
    transition: createStoreTransition(storeConfig.on)
  };
}