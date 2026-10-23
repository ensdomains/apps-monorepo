import { describe, expect, it } from 'vitest'
import { buildNameAvatarUrl } from './profileAvatar'

describe('profile avatar metadata URLs', () => {
  it('builds the Sepolia v2 metadata avatar URL for a name', () => {
    expect(buildNameAvatarUrl('anthropic.eth')).toBe(
      'https://ens-metadata-v2.ensdomains.workers.dev/sepolia/avatar/anthropic.eth',
    )
  })

  it('URL-encodes the name path segment', () => {
    expect(buildNameAvatarUrl('slash/name.eth')).toBe(
      'https://ens-metadata-v2.ensdomains.workers.dev/sepolia/avatar/slash%2Fname.eth',
    )
  })
})
