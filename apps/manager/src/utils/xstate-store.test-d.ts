import { createStore } from '@xstate/store-react'
import * as v from 'valibot'
import { expectTypeOf, test } from 'vitest'
import { createPersistedStore, persist } from './xstate-store'

const countSchema = v.object({ count: v.number() })

test('persist accepts a schema whose output matches the store context', () => {
  persist<{ count: number }, never, never>({
    name: 'count',
    schema: countSchema,
  })
})

test('persist rejects a schema whose output does not match the store context', () => {
  persist<{ count: number }, never, never>({
    name: 'count',
    // @ts-expect-error count must be a number
    schema: v.object({ count: v.string() }),
  })
})

test('createPersistedStore accepts a schema whose output matches context', () => {
  createPersistedStore(
    {
      context: { count: 0 },
      on: {},
    },
    { key: 'count', schema: countSchema },
  )
})

test('createPersistedStore rejects a schema whose output does not match context', () => {
  createPersistedStore(
    {
      context: { count: 0 },
      on: {},
    },
    {
      key: 'count',
      // @ts-expect-error count must be a number
      schema: v.object({ count: v.string() }),
    },
  )
})

test('store context stays aligned when persist schema matches', () => {
  const store = createStore({
    context: { count: 0 },
    on: {},
  }).with(persist({ name: 'count', schema: countSchema }))

  expectTypeOf(store.get().context).toEqualTypeOf<{ count: number }>()
})
