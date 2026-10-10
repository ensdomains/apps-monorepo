import type { NameDetail } from '@ens-apps/indexer/reads'
import { getNameDetailQueryOptions } from './useNameDetail'

type GetRegistrationDataParameters = { readonly name: string }

const toSeconds = (date: Date | null | undefined): number | null =>
  date ? Math.floor(date.getTime() / 1000) : null

// An expiry bigname cannot serve as a date, such as a name that never
// expires, comes back as null.
export const toRegistrationData = (detail: NameDetail | null) => ({
  createdAt: toSeconds(detail?.createdAt),
  registeredAt: toSeconds(detail?.registeredAt),
  expiry: toSeconds(detail?.expiresAt),
})

/** A name's expiry and registration dates, in either era, from its detail. */
export const getRegistrationDataQueryOptions = (
  params: GetRegistrationDataParameters,
) => ({
  ...getNameDetailQueryOptions(params),
  select: toRegistrationData,
})
