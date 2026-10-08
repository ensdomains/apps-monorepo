import { createStore } from '@xstate/store-react'
import * as v from 'valibot'
import { type Address, isAddress } from 'viem'
import { type PersistedContextSchema, persist } from '@/utils/xstate-store'

const SEARCH_HISTORY_STORAGE_KEY = '@manager-v4/search_history'
const MAX_HISTORY_ITEMS = 15

const searchHistoryItemSchema = v.union([
  v.object({
    kind: v.literal('name'),
    value: v.string(),
    timestamp: v.number(),
  }),
  v.object({
    kind: v.literal('address'),
    value: v.custom<Address>(
      (value): value is Address =>
        typeof value === 'string' && isAddress(value),
    ),
    timestamp: v.number(),
  }),
])

export type SearchHistoryItem = v.InferOutput<typeof searchHistoryItemSchema>

type SearchHistoryContext = {
  readonly history: readonly SearchHistoryItem[]
}

const searchHistoryContextSchema = v.object({
  history: v.array(searchHistoryItemSchema),
}) satisfies PersistedContextSchema<SearchHistoryContext>

type SearchHistoryEvents = {
  readonly addToHistory: Pick<SearchHistoryItem, 'value' | 'kind'>
  readonly clearHistory: Record<string, never>
  readonly removeFromHistory: { readonly value: string }
}

export const searchHistoryStore = createStore<
  SearchHistoryContext,
  SearchHistoryEvents,
  never
>({
  context: {
    history: [],
  },
  on: {
    addToHistory(context, event) {
      if (!event.value.trim()) {
        return context
      }

      const trimmedValue = event.value.trim()
      const filtered = context.history.filter(
        (item) => item.value.toLowerCase() !== trimmedValue.toLowerCase(),
      )
      const newItem = {
        kind: event.kind,
        value: trimmedValue,
        timestamp: Date.now(),
      } as SearchHistoryItem

      return {
        ...context,
        history: [newItem, ...filtered].slice(0, MAX_HISTORY_ITEMS),
      }
    },
    clearHistory: (context) => ({
      ...context,
      history: [],
    }),
    removeFromHistory: (context, event) => ({
      ...context,
      history: context.history.filter(
        (item) => item.value.toLowerCase() !== event.value.toLowerCase(),
      ),
    }),
  },
}).with(
  persist({
    name: SEARCH_HISTORY_STORAGE_KEY,
    schema: searchHistoryContextSchema,
  }),
)
