import { useQuery } from '@tanstack/react-query'
import { getV1ExpiryQueryOptions } from '@/features/profile/hooks/useV1Expiry'
import { getV2RegistrationDataQueryOptions } from '@/features/profile/hooks/useV2RegistrationData'
import type { ProtocolVersion } from '@/utils/types'
import { isExtendable2LD } from '../utils/nameExtension'
import { useIsRenewable } from './useIsRenewable'
import type { SelectedName } from './useRenewalTransactions'

type UseCanExtendParameters = {
  name: string
  protocolVersion: ProtocolVersion
  /** Skip the queries when the answer isn't needed yet (e.g. name not in grace). */
  enabled?: boolean
}

type UseCanExtendReturnType = {
  /**
   * Whether the name can actually be renewed right now. Single source of truth
   * for both the Extend button and the grace-banner copy so they never disagree.
   */
  canExtend: boolean
  selectedName: SelectedName
  expiryDate: Date | undefined
}

/**
 * "Can this name be renewed right now?" — combines the client-side
 * `isExtendable2LD` window check with the renewer's authoritative on-chain
 * `isRenewable`.
 *
 * For v1 names this is decisive: `ETHRenewerV1` only renews RESERVED
 * (premigrated) or in-grace names, so a v1 name with no premigration reservation
 * is NOT renewable even while it sits in its BaseRegistrar grace window — the
 * banner must not promise an extension the renewer would revert. v2 relies on the
 * client-side window (the v2 registrar renews throughout registered + grace).
 */
export const useCanExtend = ({
  name,
  protocolVersion,
  enabled = true,
}: UseCanExtendParameters): UseCanExtendReturnType => {
  const isV2 = protocolVersion === 'ENSv2'

  const v1ExpiryQuery = useQuery({
    ...getV1ExpiryQueryOptions({ name }),
    enabled: enabled && !isV2,
  })
  const v2DataQuery = useQuery({
    ...getV2RegistrationDataQueryOptions({ name }),
    enabled: enabled && isV2,
  })

  const expirySeconds = isV2
    ? (v2DataQuery.data?.expiry ?? null)
    : v1ExpiryQuery.data?.expiry
      ? Number(v1ExpiryQuery.data.expiry)
      : null
  const expiryDate =
    expirySeconds !== null ? new Date(expirySeconds * 1000) : undefined

  const selectedName: SelectedName = { name, isV2, expiryDate }

  const { data: v1Renewable } = useIsRenewable({
    name,
    isV2,
    enabled: enabled && !isV2,
  })

  const canExtend =
    isExtendable2LD(selectedName) && (isV2 || Boolean(v1Renewable))

  return { canExtend, selectedName, expiryDate }
}
