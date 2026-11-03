import { describe, expect, it } from 'vitest'
import {
  getPayingMethods,
  getPaymentMethodVisibility,
} from './paymentMethodVisibility'

const methods = (selected?: string) =>
  ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, isSelected: id === selected }))

const visibleIds = (selected: string | undefined, isExpanded: boolean) =>
  getPaymentMethodVisibility(methods(selected), isExpanded).visibleMethods.map(
    ({ id }) => id,
  )

describe('getPaymentMethodVisibility', () => {
  it.each([
    { selected: undefined, isExpanded: false, expected: ['a', 'b', 'c'] },
    { selected: 'e', isExpanded: false, expected: ['a', 'b', 'c', 'e'] },
    {
      selected: undefined,
      isExpanded: true,
      expected: ['a', 'b', 'c', 'd', 'e'],
    },
  ])(
    'shows $expected (selected $selected, expanded $isExpanded)',
    ({ selected, isExpanded, expected }) => {
      expect(visibleIds(selected, isExpanded)).toEqual(expected)
    },
  )
})

describe('getPayingMethods', () => {
  it.each([
    { selected: 'd', isPaying: true, expected: ['d'] },
    { selected: 'd', isPaying: false, expected: ['a', 'b', 'c', 'd', 'e'] },
    {
      selected: undefined,
      isPaying: true,
      expected: ['a', 'b', 'c', 'd', 'e'],
    },
  ])(
    'lists $expected (selected $selected, paying $isPaying)',
    ({ selected, isPaying, expected }) => {
      expect(
        getPayingMethods(methods(selected), isPaying).map(({ id }) => id),
      ).toEqual(expected)
    },
  )
})
