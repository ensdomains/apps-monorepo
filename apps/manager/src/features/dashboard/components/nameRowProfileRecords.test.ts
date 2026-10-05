import { describe, expect, it } from 'vitest'
import type { ProfileRecordsResult } from '@/features/profile/service/profileRecords'
import { getNameRowProfilePreview } from './nameRowProfileRecords'

const profileRecords = (
  texts: ProfileRecordsResult['texts'],
): ProfileRecordsResult => ({
  coins: [],
  texts,
})

describe('getNameRowProfilePreview', () => {
  it('marks generated avatar color as pending while profile records are loading', () => {
    expect(
      getNameRowProfilePreview({
        label: 'alaska.eth',
        isLoading: true,
      }).isAvatarPending,
    ).toBe(true)

    expect(
      getNameRowProfilePreview({
        label: 'alaska.eth',
        records: profileRecords([{ key: 'theme', value: '#E72A96' }]),
      }).isAvatarPending,
    ).toBe(false)
  })

  it('uses the profile theme record for themed generated avatars', () => {
    const preview = getNameRowProfilePreview({
      label: 'alaska.eth',
      records: profileRecords([{ key: 'theme', value: '#E72A96' }]),
    })

    expect(preview.themeColor).toBe('#E72A96')
  })

  it('uses the saved avatar record only when an explicit record exists', () => {
    expect(
      getNameRowProfilePreview({
        label: 'alaska.eth',
        records: profileRecords([{ key: 'theme', value: '#E72A96' }]),
      }).avatarRecord,
    ).toBeUndefined()

    expect(
      getNameRowProfilePreview({
        label: 'alaska.eth',
        name: 'alaska.eth',
        records: profileRecords([
          { key: 'avatar', value: 'https://example.com/avatar.png' },
        ]),
      }).avatarRecord,
    ).toBe('https://example.com/avatar.png')
  })

  it('preserves content-addressed avatar records for resolution', () => {
    const preview = getNameRowProfilePreview({
      label: 'Display Name',
      name: 'normalized.eth',
      records: profileRecords([
        { key: 'avatar', value: ' ipfs://new-avatar ' },
      ]),
    })

    expect(preview.avatarRecord).toBe('ipfs://new-avatar')
  })
})
