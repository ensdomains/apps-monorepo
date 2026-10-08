import type { NameDetail } from '@ens-apps/indexer/reads'
import { getNameDetailQueryOptions } from './useNameDetail'

type GetRegistrationDataParameters = { readonly name: string }

const toSeconds = (date: Date | null | undefined): number | null =>
  date ? Math.floor(date.getTime() / 1000) : null

// An expiry bigname cannot serve as a date, such as a name that never
// expires, comes back as null.
export const toV2RegistrationData = (detail: NameDetail | null) => ({
  createdAt: toSeconds(detail?.createdAt),
  registeredAt: toSeconds(detail?.registeredAt),
  expiry: toSeconds(detail?.expiresAt),
})

export const getV2RegistrationDataQueryOptions = (
  params: GetRegistrationDataParameters,
) => ({
  ...getNameDetailQueryOptions(params),
  select: toV2RegistrationData,
})
