import { match } from 'ts-pattern'
import type { PremiumLabel } from '@/features/register/utils'

export const getPremiumLabel = (
  labelLength: number,
): PremiumLabel | undefined =>
  match(labelLength)
    .with(
      3,
      () =>
        ({ label: '3 character premium name', variant: 'premium-3' }) as const,
    )
    .with(
      4,
      () =>
        ({ label: '4 character premium name', variant: 'premium-4' }) as const,
    )
    .otherwise(() => undefined)
