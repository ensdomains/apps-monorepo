import { describe, expect, it } from 'vitest'
import type { PaymentMethod } from '../types'
import { paymentMethodsStore } from './payment-methods'

const method = (id: string): PaymentMethod => ({
  id,
  name: `Card ${id}`,
  type: 'card',
  expires: '01/30',
})

/**
 * `transition` is the store's pure reducer. Driving it directly keeps every case
 * isolated from the module-level singleton and its localStorage subscriber, and
 * hands us both the previous and next context so we can assert the handlers
 * never mutate in place — the guarantee immer used to provide here.
 *
 * The array is handed to the store by reference on purpose: the caller's own
 * array is the one under observation, which is what makes the no-mutation
 * assertions meaningful. Marking it `readonly` would also not typecheck, since
 * the store's context is a mutable `PaymentMethod[]`.
 */
const transition = (
  paymentMethods: PaymentMethod[],
  event: Parameters<typeof paymentMethodsStore.transition>[1],
) => {
  const before = {
    ...paymentMethodsStore.getInitialSnapshot(),
    context: { paymentMethods },
  }
  const [after] = paymentMethodsStore.transition(before, event)
  return { before: before.context, after: after.context }
}

describe('paymentMethodsStore', () => {
  describe('add', () => {
    it('appends to the end so the existing default is kept', () => {
      const { after } = transition([method('a')], {
        type: 'add',
        paymentMethod: method('b'),
      })

      expect(after.paymentMethods.map((pm) => pm.id)).toEqual(['a', 'b'])
    })

    it('adds to an empty list', () => {
      const { after } = transition([], {
        type: 'add',
        paymentMethod: method('a'),
      })

      expect(after.paymentMethods.map((pm) => pm.id)).toEqual(['a'])
    })

    it('does not mutate the previous context', () => {
      const existing = [method('a')]
      const { before, after } = transition(existing, {
        type: 'add',
        paymentMethod: method('b'),
      })

      expect(before.paymentMethods).toHaveLength(1)
      expect(existing).toHaveLength(1)
      expect(after.paymentMethods).not.toBe(before.paymentMethods)
    })
  })

  describe('remove', () => {
    it('drops only the matching id', () => {
      const { after } = transition([method('a'), method('b'), method('c')], {
        type: 'remove',
        id: 'b',
      })

      expect(after.paymentMethods.map((pm) => pm.id)).toEqual(['a', 'c'])
    })

    it('leaves the list intact when the id is absent', () => {
      const { after } = transition([method('a')], {
        type: 'remove',
        id: 'missing',
      })

      expect(after.paymentMethods.map((pm) => pm.id)).toEqual(['a'])
    })

    it('does not mutate the previous context', () => {
      const existing = [method('a'), method('b')]
      const { before, after } = transition(existing, {
        type: 'remove',
        id: 'a',
      })

      expect(before.paymentMethods.map((pm) => pm.id)).toEqual(['a', 'b'])
      expect(existing.map((pm) => pm.id)).toEqual(['a', 'b'])
      expect(after.paymentMethods).not.toBe(before.paymentMethods)
    })
  })

  describe('setDefault', () => {
    it('moves the selected method to the front', () => {
      const { after } = transition([method('a'), method('b'), method('c')], {
        type: 'setDefault',
        index: 2,
      })

      expect(after.paymentMethods.map((pm) => pm.id)).toEqual(['c', 'a', 'b'])
    })

    it('preserves the relative order of the remaining methods', () => {
      const { after } = transition(
        [method('a'), method('b'), method('c'), method('d')],
        { type: 'setDefault', index: 1 },
      )

      expect(after.paymentMethods.map((pm) => pm.id)).toEqual([
        'b',
        'a',
        'c',
        'd',
      ])
    })

    it('keeps the order when the first method is already the default', () => {
      const { after } = transition([method('a'), method('b')], {
        type: 'setDefault',
        index: 0,
      })

      expect(after.paymentMethods.map((pm) => pm.id)).toEqual(['a', 'b'])
    })

    it('returns the identical context for an out-of-range index', () => {
      const { before, after } = transition([method('a')], {
        type: 'setDefault',
        index: 5,
      })

      // Reference equality matters: @xstate/store reuses the whole snapshot when
      // the context is unchanged, which is what suppresses the re-render and the
      // localStorage write.
      expect(after).toBe(before)
    })

    it('returns the identical context for a negative index', () => {
      const { before, after } = transition([method('a')], {
        type: 'setDefault',
        index: -1,
      })

      expect(after).toBe(before)
    })

    it('does not mutate the previous context', () => {
      const existing = [method('a'), method('b')]
      const { before, after } = transition(existing, {
        type: 'setDefault',
        index: 1,
      })

      expect(before.paymentMethods.map((pm) => pm.id)).toEqual(['a', 'b'])
      expect(existing.map((pm) => pm.id)).toEqual(['a', 'b'])
      expect(after.paymentMethods).not.toBe(before.paymentMethods)
    })
  })
})
