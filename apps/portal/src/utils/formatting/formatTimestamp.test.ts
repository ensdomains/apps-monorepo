import { describe, expect, it } from 'vitest'
import { formatTimestamp } from './formatTimestamp'

describe('formatTimestamp', () => {
  it('should format timestamp to YYYY/MM/DD HH:MM:SS format', () => {
    // 2021-01-01 00:00:00 UTC
    const timestamp = 1609459200n

    const result = formatTimestamp(timestamp)

    expect(result).toBe('2021/01/01 00:00:00')
  })

  it('should format timestamp with time correctly', () => {
    // 2021-06-15 14:10:45 UTC
    const timestamp = 1623766245n

    const result = formatTimestamp(timestamp)

    expect(result).toBe('2021/06/15 14:10:45')
  })

  it('should replace hyphens with slashes in date', () => {
    const timestamp = 1609459200n

    const result = formatTimestamp(timestamp)

    expect(result).not.toContain('-')
    expect(result).toContain('/')
  })

  it('should replace T with space between date and time', () => {
    const timestamp = 1609459200n

    const result = formatTimestamp(timestamp)

    expect(result).not.toContain('T')
    expect(result).toContain(' ')
  })

  it('should remove milliseconds from ISO string', () => {
    const timestamp = 1609459200n

    const result = formatTimestamp(timestamp)

    expect(result).not.toContain('.')
    expect(result).not.toContain('Z')
  })

  it('should return null for undefined timestamp', () => {
    const result = formatTimestamp(undefined)

    expect(result).toBeNull()
  })

  it('should handle midnight timestamps', () => {
    // 2020-01-01 00:00:00 UTC
    const timestamp = 1577836800n

    const result = formatTimestamp(timestamp)

    expect(result).toBe('2020/01/01 00:00:00')
  })

  it('should handle timestamps at end of day', () => {
    // 2021-12-31 23:59:59 UTC
    const timestamp = 1640995199n

    const result = formatTimestamp(timestamp)

    expect(result).toBe('2021/12/31 23:59:59')
  })

  it('should pad single digit months and days with zeros', () => {
    // 2021-01-05 04:04:05 UTC
    const timestamp = 1609819445n

    const result = formatTimestamp(timestamp)

    expect(result).toBe('2021/01/05 04:04:05')
  })
})
