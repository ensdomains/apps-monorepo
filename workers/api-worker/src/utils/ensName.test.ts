import { describe, expect, it } from 'vitest'
import { getParentName, isEthSecondLevelName } from './ensName.js'

describe('isEthSecondLevelName', () => {
  it.each([
    ['alice.eth', true],
    ['pay.alice.eth', false],
    ['eth', false],
    ['.eth', false],
    ['alice.com', false],
    ['sub.alice.com', false],
  ])('%s → %s', (name, expected) => {
    expect(isEthSecondLevelName(name)).toBe(expected)
  })
})

describe('getParentName', () => {
  it.each([
    ['pay.alice.eth', 'alice.eth'],
    ['alice.eth', 'eth'],
    ['eth', undefined],
    ['eth.', undefined],
  ])('%s → %s', (name, expected) => {
    expect(getParentName(name)).toBe(expected)
  })
})
