import { useQuery } from '@tanstack/react-query'
import type { ProtocolVersion } from '@/utils/types'
import { getV2RegistrationDataQueryOptions } from './useV2RegistrationData'

export type UseGraceStatusParameters = {
  name: string
  /** `undefined` disables the read (e.g. a DNS name, which has no expiry). */
  protocolVersion: ProtocolVersion | undefined
}

export type UseGraceStatusReturnType = {
  isInGrace: boolean
  isExpired: boolean
  graceEndDate: Date | null
  isLoading: boolean
  error: Error | null
}

const NOT_IN_GRACE = {
  isInGrace: false,
  isExpired: false,
  graceEndDate: null,
} as const

/**
 * Whether the name is past its expiry and still renewable, from bigname's
 * served expiry and grace end for either era (see `getV2RegistrationData`):
 * an ENSv1 lease's 90-day grace, an ENSv2 `.eth` name's 28 days, none for a
 * subname. bigname replaces the on-chain BaseRegistrar expiry read the ENSv1
 * path used to make.
 */
export function useGraceStatus({
  name,
  protocolVersion,
}: UseGraceStatusParameters): UseGraceStatusReturnType {
  const { data, isLoading, error } = useQuery({
    ...getV2RegistrationDataQueryOptions({ name }),
    enabled: protocolVersion !== undefined,
  })

  if (protocolVersion === undefined)
    return { ...NOT_IN_GRACE, isLoading: false, error: null }
  if (isLoading) return { ...NOT_IN_GRACE, isLoading: true, error: null }
  if (error) return { ...NOT_IN_GRACE, isLoading: false, error }
  if (!data || data.expiry === null || data.graceEndsAt === null)
    return { ...NOT_IN_GRACE, isLoading: false, error: null }

  const nowSeconds = Math.floor(Date.now() / 1000)
  return {
    isInGrace: nowSeconds > data.expiry && nowSeconds < data.graceEndsAt,
    isExpired: nowSeconds > data.expiry,
    graceEndDate: new Date(data.graceEndsAt * 1000),
    isLoading: false,
    error: null,
  }
}
