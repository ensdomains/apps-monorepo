import type { RegistrationPriceResult } from '@/features/register/hooks/useRegistrationPrice'

export function isPriceResult(
  value: unknown,
): value is RegistrationPriceResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'base' in value &&
    'total' in value &&
    'totalRaw' in value
  )
}
