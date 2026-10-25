import { createStore } from '@xstate/store-react'
import * as v from 'valibot'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { persist } from './xstate-store'

const countSchema = v.object({ count: v.number() })

describe('persist', () => {
  const STORAGE_KEY = 'persist-store'

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('hydrates valid snapshot context', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ context: { count: 7 } }))

    const store = createStore({
      context: { count: 0 },
      on: {},
    }).with(persist({ name: STORAGE_KEY, schema: countSchema }))

    expect(store.get().context.count).toBe(7)
  })

  it('uses fallback when persisted types do not match the schema', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ context: { count: '7' } }),
    )

    const store = createStore({
      context: { count: 0 },
      on: {},
    }).with(persist({ name: STORAGE_KEY, schema: countSchema }))

    expect(store.get().context.count).toBe(0)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '')).toEqual({
      context: { count: '7' },
    })
  })

  it('uses fallback when the snapshot wrapper is missing', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ count: 7 }))

    const store = createStore({
      context: { count: 0 },
      on: {},
    }).with(persist({ name: STORAGE_KEY, schema: countSchema }))

    expect(store.get().context.count).toBe(0)
  })

  it('uses fallback when localStorage JSON is invalid', () => {
    localStorage.setItem(STORAGE_KEY, '{not-json')

    const store = createStore({
      context: { count: 0 },
      on: {},
    }).with(persist({ name: STORAGE_KEY, schema: countSchema }))

    expect(store.get().context.count).toBe(0)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{not-json')
  })

  it('writes sanitized context back when hydration strips extra fields', () => {
    const countOnlySchema = v.pipe(
      v.object({
        count: v.number(),
        extra: v.optional(v.string()),
      }),
      v.transform(({ count }) => ({ count })),
    )

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ context: { count: 7, extra: 'drop-me' } }),
    )

    const store = createStore({
      context: { count: 0 },
      on: {},
    }).with(persist({ name: STORAGE_KEY, schema: countOnlySchema }))

    expect(store.get().context).toEqual({ count: 7 })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '')).toMatchObject({
      context: { count: 7 },
    })
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '').context,
    ).not.toHaveProperty('extra')
  })
})
