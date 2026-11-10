import type { FilterChipDef } from './components/FilterChips'

/** The selected chip, or `fallback` once it is known to be empty: an empty chip is hidden, so it can't be cleared. */
export const resolveSelectedChip = <
  T extends string,
  V extends T | null,
  F extends T | null,
>(
  chips: readonly FilterChipDef<T>[],
  value: V,
  fallback: F,
): V | F =>
  chips.some((chip) => chip.value === value && chip.count === 0)
    ? fallback
    : value

/** The first chip that can be opened and is not known to be empty. */
export const firstOpenChip = <T extends string>(
  chips: readonly FilterChipDef<T>[],
  fallback: T,
): T =>
  chips.find((chip) => !chip.disabled && chip.count !== 0)?.value ?? fallback
