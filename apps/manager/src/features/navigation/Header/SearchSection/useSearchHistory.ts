import { createStore } from '@xstate/store-react'
import type { Address } from 'viem'
import { persist } from '@/utils/xstate-store'

const SEARCH_HISTORY_STORAGE_KEY = '@manager-v4/search_history'
const MAX_HISTORY_ITEMS = 15

export type SearchHistoryItem =
  | {
      kind: 'name'
      value: string
      timestamp: number
    }
  | {
      kind: 'address'
      value: Address
      timestamp: number
    }

type SearchHistoryContext = {
  history: SearchHistoryItem[]
}

type SearchHistoryEvents = {
  addToHistory: Pick<SearchHistoryItem, 'value' | 'kind'>
  clearHistory: Record<string, never>
  removeFromHistory: { value: string }
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

      // Remove any existing entry with the same value
      const filtered = context.history.filter(
        (item) => item.value.toLowerCase() !== trimmedValue.toLowerCase(),
      )

      // Add new item at the beginning
      const newItem = {
        kind: event.kind,
        value: trimmedValue,
        timestamp: Date.now(),
      } as SearchHistoryItem

      // Keep only the most recent MAX_HISTORY_ITEMS
      const updated = [newItem, ...filtered].slice(0, MAX_HISTORY_ITEMS)

      return {
        ...context,
        history: updated,
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
  }),
)
