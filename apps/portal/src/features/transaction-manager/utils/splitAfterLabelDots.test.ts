import { describe, expect, it } from 'vitest'
import { splitAfterLabelDots } from './splitAfterLabelDots'

describe('splitAfterLabelDots', () => {
  it('splits after each label separator of a name in a sentence', () => {
    expect(
      splitAfterLabelDots('Set sub.young-badger.eth as the primary name'),
    ).toEqual(['Set sub.', 'young-badger.', 'eth as the primary name'])
  })

  it('keeps text without dots whole', () => {
    expect(splitAfterLabelDots('Grant registry roles')).toEqual([
      'Grant registry roles',
    ])
  })

  it('ignores a dot before a space or at the end', () => {
    expect(splitAfterLabelDots('Done. Set alice.eth.')).toEqual([
      'Done. Set alice.',
      'eth.',
    ])
  })

  it('keeps decimals whole', () => {
    expect(splitAfterLabelDots('Approve 1.5 USDC for registration')).toEqual([
      'Approve 1.5 USDC for registration',
    ])
  })

  it('still splits numeric labels', () => {
    expect(splitAfterLabelDots('Set 184.eth as the primary name')).toEqual([
      'Set 184.',
      'eth as the primary name',
    ])
  })

  it('returns a single empty segment for empty text', () => {
    expect(splitAfterLabelDots('')).toEqual([''])
  })
})
