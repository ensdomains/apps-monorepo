import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { getSearchNameKind } from '@/features/search/getSearchNameKind'
import { parseSearchQuery } from '@/features/search/parseSearchQuery'
import type {
  NameSearchOutcome,
  ParsedSearchQuery,
  SearchNameKind,
} from '@/features/search/search.types'
import { useNameClassification } from '@/features/search/useNameClassification'
import { getPremiumLabel } from '@/features/shared/registration/nameUtils'
import {
  INITIAL_PRICING_OPTIONS,
  PRICING_DURATIONS,
} from '@/features/shared/registration/pricing'
import type { PricingOptions } from '@/features/shared/registration/pricingTypes'
import { getNamePricingQueryOptions } from '@/features/shared/service/checkNameAvailabilityService'

export type DisplayState =
  | { type: 'idle' }
  | { type: 'address'; address: Address }
  | { type: 'searching'; domainName: string }
  | { type: 'available'; domainName: string }
  | { type: 'unavailable'; domainName: string }
  | { type: 'not-found'; domainName: string }
  | { type: 'not-supported'; domainName: string }
  | { type: 'error'; domainName: string }

type ToDisplayStateParams = {
  readonly trimmedInput: string
  readonly parsedInput: ParsedSearchQuery
  readonly instantName: string | null
  readonly instantKind: SearchNameKind | null
  readonly isDebouncing: boolean
  readonly outcome: NameSearchOutcome
}

export const toDisplayState = ({
  trimmedInput,
  parsedInput,
  instantName,
  instantKind,
  isDebouncing,
  outcome,
}: ToDisplayStateParams): DisplayState => {
  if (!trimmedInput) return { type: 'idle' }
  if (parsedInput.type === 'address') {
    return { type: 'address', address: parsedInput.value }
  }
  if (!instantName) return { type: 'idle' }
  if (instantKind?.type === 'invalid') {
    return { type: 'not-supported', domainName: instantName }
  }
  if (
    isDebouncing ||
    outcome.type === 'loading' ||
    outcome.name !== instantName
  ) {
    return { type: 'searching', domainName: instantName }
  }

  return match(outcome)
    .with({ type: 'available' }, ({ name }) => ({
      type: 'available' as const,
      domainName: name,
    }))
    .with({ type: 'owned' }, ({ name }) => ({
      type: 'unavailable' as const,
      domainName: name,
    }))
    .with({ type: 'error' }, ({ name }) => ({
      type: 'error' as const,
      domainName: name,
    }))
    .with({ type: 'not-found' }, ({ name }) => ({
      type: 'not-found' as const,
      domainName: name,
    }))
    .with({ type: 'invalid' }, ({ name }) => ({
      type: 'not-supported' as const,
      domainName: name,
    }))
    .otherwise(() => ({ type: 'idle' as const }))
}

const toPricingOptions = (
  pricingData: {
    readonly usdc?: { readonly formatted: string }
  } | null,
): PricingOptions => {
  if (!pricingData?.usdc) return INITIAL_PRICING_OPTIONS

  const basePerYear = parseFloat(pricingData.usdc.formatted)
  const newPricing = { ...INITIAL_PRICING_OPTIONS }

  for (const duration of PRICING_DURATIONS) {
    const discount = INITIAL_PRICING_OPTIONS[duration].discount
    const discountMultiplier = 1 - discount / 100
    const perYearPrice = basePerYear * discountMultiplier
    const totalPrice = Math.ceil(perYearPrice * duration)

    newPricing[duration] = {
      ...INITIAL_PRICING_OPTIONS[duration],
      price: perYearPrice,
      discount,
      total: totalPrice,
    }
  }

  return newPricing
}

const parsedName = (parsed: ParsedSearchQuery): string | null =>
  parsed.type === 'name' ? parsed.value : null

const parsedAddress = (parsed: ParsedSearchQuery): Address | undefined =>
  parsed.type === 'address' ? parsed.value : undefined

const resultNameFromDisplayState = (
  displayState: DisplayState,
): string | undefined =>
  match(displayState)
    .with(
      { type: 'available' },
      { type: 'unavailable' },
      { type: 'searching' },
      ({ domainName }) => domainName,
    )
    .otherwise(() => undefined)

interface UseCheckAvailabilityParams {
  /** Current input value (for instant validation) */
  inputValue?: string
  /** Debounced input value (for query) */
  debouncedInput?: string
  /** Initial name to auto-search (for registration page) */
  initialName?: string
  /** Whether to auto-search the initial name */
  autoSearch?: boolean
}

export const useCheckAvailability = ({
  inputValue = '',
  debouncedInput = '',
  initialName,
  autoSearch = false,
}: UseCheckAvailabilityParams = {}) => {
  const autoSearchName = autoSearch ? initialName : undefined
  const trimmedInput = (autoSearchName ?? inputValue).trim()
  const trimmedDebouncedInput = (autoSearchName ?? debouncedInput).trim()

  const parsedInput = useMemo(
    () => parseSearchQuery(trimmedInput),
    [trimmedInput],
  )
  const parsedDebouncedInput = useMemo(
    () => parseSearchQuery(trimmedDebouncedInput),
    [trimmedDebouncedInput],
  )

  const instantName = parsedName(parsedInput)
  const instantKind = instantName ? getSearchNameKind(instantName) : null
  const debouncedName = parsedName(parsedDebouncedInput) ?? ''
  const searchedAddress = parsedAddress(parsedInput)

  const { outcome } = useNameClassification(debouncedName)

  const primaryNameQuery = useQuery({
    ...profileReverseNameQuery(searchedAddress),
    enabled: !!searchedAddress,
  })

  const isDebouncing =
    trimmedInput !== trimmedDebouncedInput && trimmedInput.length > 0

  const pricingQuery = useQuery({
    ...getNamePricingQueryOptions(
      outcome.type === 'available' ? outcome.name : undefined,
    ),
    enabled: outcome.type === 'available' && !isDebouncing,
  })

  const pricing = useMemo(
    () => toPricingOptions(pricingQuery.data ?? null),
    [pricingQuery.data],
  )

  const displayState = useMemo(
    () =>
      toDisplayState({
        trimmedInput,
        parsedInput,
        instantName,
        instantKind,
        isDebouncing,
        outcome,
      }),
    [
      trimmedInput,
      parsedInput,
      instantName,
      instantKind,
      isDebouncing,
      outcome,
    ],
  )

  const resultName = resultNameFromDisplayState(displayState)

  const premiumLabel = useMemo(
    () => (resultName ? getPremiumLabel(resultName) : undefined),
    [resultName],
  )

  const premiumUsdc = pricingQuery.data?.usdc?.premium
  const isInCooldown = typeof premiumUsdc === 'bigint' && premiumUsdc > 0n

  const isLoading =
    instantKind?.type !== 'invalid' &&
    (isDebouncing || outcome.type === 'loading')

  return {
    pricingQuery,
    pricing,
    displayState,
    premiumLabel,
    isInCooldown,
    primaryName: primaryNameQuery.data ?? null,
    isPrimaryNameLoading: primaryNameQuery.isLoading,
    isAvailable: outcome.type === 'available',
    isSearching: outcome.type === 'loading',
    isDebouncing,
    isLoading,
  }
}
