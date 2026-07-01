import { describe, expect, it } from 'vitest'
import { buildNameAvatarUrl, buildNameHeaderUrl } from './profileAvatar'

describe('profile avatar metadata URLs', () => {
  it('builds the Sepolia v2 metadata avatar URL for a name', () => {
    expect(buildNameAvatarUrl('anthropic.eth')).toBe(
      'https://ens-metadata-v2.ensdomains.workers.dev/sepolia/avatar/anthropic.eth',
    )
  })

  it('builds a cache-busted avatar URL when a version is provided', () => {
    expect(buildNameAvatarUrl('anthropic.eth', 1234)).toBe(
      'https://ens-metadata-v2.ensdomains.workers.dev/sepolia/avatar/anthropic.eth?v=1234',
    )
  })

  it('URL-encodes the name path segment', () => {
    expect(buildNameAvatarUrl('slash/name.eth')).toBe(
      'https://ens-metadata-v2.ensdomains.workers.dev/sepolia/avatar/slash%2Fname.eth',
    )
  })

  it('builds the Sepolia v2 metadata header URL for a name', () => {
    expect(buildNameHeaderUrl('anthropic.eth')).toBe(
      'https://ens-metadata-v2.ensdomains.workers.dev/sepolia/header/anthropic.eth',
    )
  })

  it('builds a cache-busted header URL when a version is provided', () => {
    expect(buildNameHeaderUrl('anthropic.eth', 1234)).toBe(
      'https://ens-metadata-v2.ensdomains.workers.dev/sepolia/header/anthropic.eth?v=1234',
    )
  })

  it('URL-encodes the header name path segment', () => {
    expect(buildNameHeaderUrl('slash/name.eth')).toBe(
      'https://ens-metadata-v2.ensdomains.workers.dev/sepolia/header/slash%2Fname.eth',
    )
  })
})
