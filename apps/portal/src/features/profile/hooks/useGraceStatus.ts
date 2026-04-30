import { useQuery } from '@tanstack/react-query'
import { V2_GRACE_PERIOD_DAYS } from '@/features/renew/utils/nameExtension'
import type { ProtocolVersion } from '@/utils/types'
import { getV1ExpiryQueryOptions } from './useV1Expiry'
import { getV2RegistrationDataQueryOptions } from './useV2RegistrationData'

const V2_GRACE_DURATION_SECONDS = V2_GRACE_PERIOD_DAYS * 24 * 60 * 60

export type UseGraceStatusParameters = {
  name: string
  protocolVersion: ProtocolVersion | undefined
}

export type UseGraceStatusReturnType = {
  isInGrace: boolean
  graceEndDate: Date | null
  isLoading: boolean
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
    ...getV2RegistrationDataQueryOptions({ name }),
    enabled: protocolVersion === 'ENSv2',
  })

  if (protocolVersion === 'ENSv1') {
    if (v1Query.isLoading) {
      return { isInGrace: false, graceEndDate: null, isLoading: true }
    }
    const data = v1Query.data
    if (!data) {
      return { isInGrace: false, graceEndDate: null, isLoading: false }
    }
    const graceEndSeconds = data.expiry + BigInt(data.gracePeriod)
    return {
      isInGrace: data.status === 'gracePeriod',
      graceEndDate: new Date(Number(graceEndSeconds) * 1000),
      isLoading: false,
    }
  }

  if (protocolVersion === 'ENSv2') {
    if (v2Query.isLoading) {
      return { isInGrace: false, graceEndDate: null, isLoading: true }
    }
    const data = v2Query.data
    if (!data || data.expiry === null) {
      return { isInGrace: false, graceEndDate: null, isLoading: false }
    }
    const nowSeconds = Math.floor(Date.now() / 1000)
    const graceEndSeconds = data.expiry + V2_GRACE_DURATION_SECONDS
    return {
      isInGrace: nowSeconds > data.expiry && nowSeconds < graceEndSeconds,
      graceEndDate: new Date(graceEndSeconds * 1000),
      isLoading: false,
    }
  }

  return { isInGrace: false, graceEndDate: null, isLoading: false }
}
