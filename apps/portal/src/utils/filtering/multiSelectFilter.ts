export type FilterGroup = {
  title: string
  options: Array<{ label: string; value: string }>
}

/**
 * Flattens all filter groups into a single array of values
 *
 * @param groups - Array of filter groups
 * @returns Flat array of all option values across all groups
 *
 * @example
 * getAllValuesFromGroups([
 *   { title: 'Group 1', options: [{ label: 'A', value: 'a' }] },
 *   { title: 'Group 2', options: [{ label: 'B', value: 'b' }] }
 * ])
 * // ['a', 'b']
 */
export const getAllValuesFromGroups = (groups: FilterGroup[]): string[] => {
  return groups.flatMap((group) => group.options.map((opt) => opt.value))
}

/**
 * Toggles a value in the selected values array (add if absent, remove if present)
 *
 * @param selectedValues - Current array of selected values
 * @param value - Value to toggle
 * @returns New array with value added or removed
 *
 * @example
 * toggleValue(['a', 'b'], 'c') // ['a', 'b', 'c']
 * toggleValue(['a', 'b'], 'b') // ['a']
 */
export const toggleValue = (
  selectedValues: string[],
  value: string,
): string[] => {
  if (selectedValues.includes(value)) {
    return selectedValues.filter((v) => v !== value)
  }
  return [...selectedValues, value]
}
