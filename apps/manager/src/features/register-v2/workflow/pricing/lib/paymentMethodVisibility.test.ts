import { describe, expect, it } from 'vitest'
import { getPaymentMethodVisibility } from './paymentMethodVisibility'

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
