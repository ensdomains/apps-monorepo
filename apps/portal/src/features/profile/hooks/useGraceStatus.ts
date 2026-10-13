import { useQuery } from '@tanstack/react-query'
import type { ProtocolVersion } from '@/utils/types'
import { getRegistrationDataQueryOptions } from './useRegistrationData'
import { getV1ExpiryQueryOptions } from './useV1Expiry'

export type UseGraceStatusParameters = {
  name: string
  protocolVersion: ProtocolVersion | undefined
}

export type UseGraceStatusReturnType = {
  isInGrace: boolean
  isExpired: boolean
  graceEndDate: Date | null
  isLoading: boolean
  error: Error | null
}

/** Grace from bigname's `grace_ends_at`: 28 days for a `.eth` name, none for a subname. */
export const v2GraceStatus = (
  {
    expiry,
    graceEnd,
  }: { readonly expiry: number; readonly graceEnd: number | null },
  nowSeconds: number,
) => {
  const graceEndSeconds = graceEnd ?? expiry
  return {
    isInGrace: nowSeconds > expiry && nowSeconds < graceEndSeconds,
    isExpired: nowSeconds > expiry,
    graceEndDate: new Date(graceEndSeconds * 1000),
  }
}

export function useGraceStatus({
  name,
  protocolVersion,
}: UseGraceStatusParameters): UseGraceStatusReturnType {
  const v1Query = useQuery({
    ...getV1ExpiryQueryOptions({ name }),
    enabled: protocolVersion === 'ENSv1',
  })

  const v2Query = useQuery({
    ...getRegistrationDataQueryOptions({ name }),
    enabled: protocolVersion === 'ENSv2',
  })

  if (protocolVersion === 'ENSv1') {
    if (v1Query.isLoading) {
      return {
        isInGrace: false,
        isExpired: false,
        graceEndDate: null,
        isLoading: true,
        error: null,
      }
    }
    if (v1Query.error) {
      return {
        isInGrace: false,
        isExpired: false,
        graceEndDate: null,
        isLoading: false,
        error: v1Query.error,
      }
    }
    const data = v1Query.data
    if (!data) {
      return {
        isInGrace: false,
        isExpired: false,
        graceEndDate: null,
        isLoading: false,
        error: null,
      }
    }
    const graceEndSeconds = data.expiry + BigInt(data.gracePeriod)
    return {
      isInGrace: data.status === 'gracePeriod',
      isExpired: data.status !== 'active',
      graceEndDate: new Date(Number(graceEndSeconds) * 1000),
      isLoading: false,
      error: null,
    }
  }

  if (protocolVersion === 'ENSv2') {
    if (v2Query.isLoading) {
      return {
        isInGrace: false,
        isExpired: false,
        graceEndDate: null,
        isLoading: true,
        error: null,
      }
    }
    if (v2Query.error) {
      return {
        isInGrace: false,
        isExpired: false,
        graceEndDate: null,
        isLoading: false,
        error: v2Query.error,
      }
    }
    const data = v2Query.data
    if (!data || data.expiry === null) {
      return {
        isInGrace: false,
        isExpired: false,
        graceEndDate: null,
        isLoading: false,
        error: null,
      }
    }
    return {
      ...v2GraceStatus(data, Math.floor(Date.now() / 1000)),
      isLoading: false,
      error: null,
    }
  }

  return {
    isInGrace: false,
    isExpired: false,
    graceEndDate: null,
    isLoading: false,
    error: null,
  }
}
