import { describe, expect, it } from 'vitest'
import {
  type FilterGroup,
  getAllValuesFromGroups,
  toggleValue,
} from './multiSelectFilter'

describe('multiSelectFilter', () => {
  describe('getAllValuesFromGroups', () => {
    it('should flatten multiple groups into single array of values', () => {
      const groups: FilterGroup[] = [
        {
          title: 'Group 1',
          options: [
            { label: 'Option A', value: 'a' },
            { label: 'Option B', value: 'b' },
          ],
        },
        {
          title: 'Group 2',
          options: [
            { label: 'Option C', value: 'c' },
            { label: 'Option D', value: 'd' },
          ],
        },
      ]

      const result = getAllValuesFromGroups(groups)

      expect(result).toEqual(['a', 'b', 'c', 'd'])
    })

    it('should return empty array for empty groups', () => {
      const result = getAllValuesFromGroups([])

      expect(result).toEqual([])
    })

    it('should handle groups with no options', () => {
      const groups: FilterGroup[] = [
        { title: 'Empty Group', options: [] },
        {
          title: 'Group 2',
          options: [{ label: 'Option A', value: 'a' }],
        },
      ]

      const result = getAllValuesFromGroups(groups)

      expect(result).toEqual(['a'])
    })

    it('should preserve order of values', () => {
      const groups: FilterGroup[] = [
        {
          title: 'Group 1',
          options: [
            { label: 'Z', value: 'z' },
            { label: 'A', value: 'a' },
          ],
        },
      ]

      const result = getAllValuesFromGroups(groups)

      expect(result).toEqual(['z', 'a']) // Preserves original order
    })
  })

  describe('toggleValue', () => {
    it('should add value when not present', () => {
      const selectedValues = ['a', 'b']

      const result = toggleValue(selectedValues, 'c')

      expect(result).toEqual(['a', 'b', 'c'])
    })

    it('should remove value when present', () => {
      const selectedValues = ['a', 'b', 'c']

      const result = toggleValue(selectedValues, 'b')

      expect(result).toEqual(['a', 'c'])
    })

    it('should not mutate original array', () => {
      const selectedValues = ['a', 'b']

      const result = toggleValue(selectedValues, 'c')

      expect(selectedValues).toEqual(['a', 'b']) // Original unchanged
      expect(result).toEqual(['a', 'b', 'c'])
    })

    it('should handle empty array', () => {
      const result = toggleValue([], 'a')

      expect(result).toEqual(['a'])
    })

    it('should handle toggling last remaining value', () => {
      const result = toggleValue(['a'], 'a')

      expect(result).toEqual([])
    })
  })
})
