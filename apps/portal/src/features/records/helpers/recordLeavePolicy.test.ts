import { describe, expect, it } from 'vitest'
import { shouldConfirmRecordNavigation } from './recordLeavePolicy'

describe('record draft navigation', () => {
  it.each([
    { changesCount: 0, nextPathname: '/alice.eth/records', expected: false },
    {
      changesCount: 2,
      nextPathname: '/alice.eth/edit-records',
      expected: false,
    },
    { changesCount: 1, nextPathname: '/alice.eth/records', expected: true },
    { changesCount: 1, nextPathname: '/bob.eth/edit-records', expected: true },
  ])(
    'protects actual unsaved work on leaving: $changesCount → $nextPathname',
    ({ changesCount, nextPathname, expected }) => {
      expect(
        shouldConfirmRecordNavigation({
          changesCount,
          currentPathname: '/alice.eth/edit-records',
          nextPathname,
        }),
      ).toBe(expected)
    },
  )
})
