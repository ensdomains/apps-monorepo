import { describe, expect, it } from 'vitest'
import { searchTextRecords } from './text'

describe('text record discovery aliases', () => {
  it.each([
    ['  BANNER ', 'header'],
    ['cover', 'header'],
    ['profile picture', 'avatar'],
    ['biography', 'description'],
    ['mobile', 'phone'],
  ])('finds %s under its resolver key', (query, key) => {
    expect(searchTextRecords(query).map((record) => record.key)).toEqual([key])
  })
})
