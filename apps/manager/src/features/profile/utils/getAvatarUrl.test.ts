import { describe, expect, it } from 'vitest'
import { AVATAR_UPLOAD_BASE_URL } from '../constants'
import { getAvatarUrl } from './getAvatarUrl'

describe('getAvatarUrl', () => {
  it('returns the avatar URL for a .eth name', () => {
    expect(getAvatarUrl('bigint.eth')).toBe(
      `${AVATAR_UPLOAD_BASE_URL}/sepolia/bigint.eth`,
    )
  })

  it('lowercases the name', () => {
    expect(getAvatarUrl('BigInt.ETH')).toBe(
      `${AVATAR_UPLOAD_BASE_URL}/sepolia/bigint.eth`,
    )
  })

  it('trims whitespace', () => {
    expect(getAvatarUrl('  bigint.eth  ')).toBe(
      `${AVATAR_UPLOAD_BASE_URL}/sepolia/bigint.eth`,
    )
  })

  it('returns undefined for empty string', () => {
    expect(getAvatarUrl('')).toBeUndefined()
  })

  it('returns undefined for whitespace-only string', () => {
    expect(getAvatarUrl('   ')).toBeUndefined()
  })

  it('handles subnames', () => {
    expect(getAvatarUrl('sub.bigint.eth')).toBe(
      `${AVATAR_UPLOAD_BASE_URL}/sepolia/sub.bigint.eth`,
    )
  })

  it('handles names without TLD', () => {
    expect(getAvatarUrl('bigint')).toBe(
      `${AVATAR_UPLOAD_BASE_URL}/sepolia/bigint`,
    )
  })

  it('handles emoji names', () => {
    expect(getAvatarUrl('🦊.eth')).toBe(
      `${AVATAR_UPLOAD_BASE_URL}/sepolia/🦊.eth`,
    )
  })

  it('handles names with multiple emojis', () => {
    expect(getAvatarUrl('🔥🚀.eth')).toBe(
      `${AVATAR_UPLOAD_BASE_URL}/sepolia/🔥🚀.eth`,
    )
  })

  it('handles names with special characters', () => {
    expect(getAvatarUrl('hello-world.eth')).toBe(
      `${AVATAR_UPLOAD_BASE_URL}/sepolia/hello-world.eth`,
    )
  })

  it('handles names with unicode characters', () => {
    expect(getAvatarUrl('café.eth')).toBe(
      `${AVATAR_UPLOAD_BASE_URL}/sepolia/café.eth`,
    )
  })

  it('handles names with numbers', () => {
    expect(getAvatarUrl('123.eth')).toBe(
      `${AVATAR_UPLOAD_BASE_URL}/sepolia/123.eth`,
    )
  })
})
