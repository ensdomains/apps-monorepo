import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useTableViewSettings } from './useTableViewSettings'

describe('useTableViewSettings', () => {
  const STORAGE_KEY = 'records-table-view-settings'

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('should use default values and persist changes to localStorage', () => {
    const { result } = renderHook(() => useTableViewSettings())

    // Check defaults
    expect(result.current[0]).toEqual({
      compact: false,
      strippedRows: false,
      wrapText: false,
    })

    // Update settings
    act(() => {
      result.current[1]({
        compact: true,
        strippedRows: false,
        wrapText: true,
      })
    })

    // Verify updated state
    expect(result.current[0]).toEqual({
      compact: true,
      strippedRows: false,
      wrapText: true,
    })

    // Verify localStorage persistence
    const storedValue = localStorage.getItem(STORAGE_KEY)
    expect(storedValue).toBeDefined()
    if (storedValue) {
      expect(JSON.parse(storedValue)).toEqual({
        compact: true,
        strippedRows: false,
        wrapText: true,
      })
    }
  })

  it('should load existing settings from localStorage', () => {
    const existingSettings = {
      compact: true,
      strippedRows: true,
      wrapText: true,
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(existingSettings))

    const { result } = renderHook(() => useTableViewSettings())

    expect(result.current[0]).toEqual(existingSettings)
  })
})
