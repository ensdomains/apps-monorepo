import { describe, expect, it } from 'vitest'
import { formatTimestamp } from './formatTimestamp'

describe('formatTimestamp', () => {
  it('should format timestamp to YYYY/MM/DD HH:MM:SS format', () => {
    // 2021-01-01 00:00:00 UTC
    const timestamp = 1609459200n

    const result = formatTimestamp(timestamp)

    expect(result).toBe('2021/01/01 00:00:00')
  })

  it('should return null for undefined timestamp', () => {
    const result = formatTimestamp(undefined)

    expect(result).toBeNull()
  })
})
