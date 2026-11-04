import { describe, expect, it } from 'vitest'
import {
  type AddressHighlightEvent,
  activeHighlightKey,
  NO_ADDRESS_HIGHLIGHT,
  nextAddressHighlight,
} from './addressHighlightState'

const hover = (sourceId: string, key: string): AddressHighlightEvent => ({
  type: 'enter',
  input: 'hover',
  sourceId,
  key,
})
const focus = (sourceId: string, key: string): AddressHighlightEvent => ({
  type: 'enter',
  input: 'focus',
  sourceId,
  key,
})
const mouseLeave = (sourceId: string): AddressHighlightEvent => ({
  type: 'leave',
  input: 'hover',
  sourceId,
})
const blur = (sourceId: string): AddressHighlightEvent => ({
  type: 'leave',
  input: 'focus',
  sourceId,
})
const remove = (sourceId: string): AddressHighlightEvent => ({
  type: 'remove',
  sourceId,
})

const run = (events: readonly AddressHighlightEvent[]) =>
  activeHighlightKey(events.reduce(nextAddressHighlight, NO_ADDRESS_HIGHLIGHT))

describe('nextAddressHighlight', () => {
  it.each<[string, readonly AddressHighlightEvent[], string | undefined]>([
    ['hover highlights', [hover('a', 'x')], 'x'],
    ['mouse leave clears', [hover('a', 'x'), mouseLeave('a')], undefined],
    [
      'a late leave keeps the newer hover',
      [hover('a', 'x'), hover('b', 'y'), mouseLeave('a')],
      'y',
    ],
    [
      'blur keeps a badge the pointer is still on',
      [hover('a', 'x'), focus('a', 'x'), blur('a')],
      'x',
    ],
    [
      'mouse leave keeps a badge that still has focus',
      [focus('a', 'x'), hover('a', 'x'), mouseLeave('a')],
      'x',
    ],
    [
      'hover wins over focus, and focus returns after it',
      [focus('a', 'x'), hover('b', 'y')],
      'y',
    ],
    [
      'focus returns once the hover elsewhere ends',
      [focus('a', 'x'), hover('b', 'y'), mouseLeave('b')],
      'x',
    ],
    [
      'removing the hovered badge clears its hover',
      [hover('a', 'x'), remove('a')],
      undefined,
    ],
    [
      'removing a badge keeps what other badges started',
      [focus('a', 'x'), hover('b', 'y'), remove('b')],
      'x',
    ],
  ])('%s', (_, events, expected) => {
    expect(run(events)).toBe(expected)
  })

  it('returns the same state when an event changes nothing', () => {
    const state = nextAddressHighlight(NO_ADDRESS_HIGHLIGHT, hover('a', 'x'))
    expect(nextAddressHighlight(state, mouseLeave('b'))).toBe(state)
    expect(nextAddressHighlight(state, remove('b'))).toBe(state)
  })
})
