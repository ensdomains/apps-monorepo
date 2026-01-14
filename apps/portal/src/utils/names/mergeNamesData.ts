import type { NameWithRelation } from '@ensdomains/ensjs/subgraph'
import type { EnsNetworkName, WithEnsNetwork } from '@/utils/types'

/**
 * V1 name structure with date-based expiry
 */
export type V1Name = {
  name: NameWithRelation['name']
  expiryDate?: { date: Date | null } | null
}

/**
 * V2 name structure with timestamp-based expiry (seconds as number)
 */
export type V2Name = {
  name: NameWithRelation['name']
  expiryDate?: number | null
}

/**
 * Unified name structure for display
 */
export type MergedName = WithEnsNetwork<{
  name: string | null
  expiryDate?: Date | null
}>

/**
 * Merges V1 and V2 ENS names into a unified format for display.
 * Handles different expiry date formats:
 * - V1: { date: Date | null } or null
 * - V2: number timestamp (seconds) or null
 *
 * @param v1Names - Array of V1 names from Sepolia
 * @param v2Names - Array of V2 names from Namechain Sepolia
 * @returns Combined array with normalized expiry dates and network labels
 *
 * @example
 * const v1 = [{ name: 'vitalik.eth', expiryDate: { date: new Date('2025-01-01') } }]
 * const v2 = [{ name: 'alice.eth', expiryDate: 1735689600 }]
 * mergeNamesData(v1, v2)
 * // [
 * //   { name: 'vitalik.eth', expiryDate: Date('2025-01-01'), network: 'sepolia' },
 * //   { name: 'alice.eth', expiryDate: Date('2025-01-01'), network: 'namechainSepolia' }
 * // ]
 */
export const mergeNamesData = (
  v1Names: V1Name[] | undefined,
  v2Names: V2Name[] | undefined,
): MergedName[] => {
  const v1Transformed: MergedName[] = (v1Names || []).map(
    ({ name, expiryDate }) => ({
      name,
      expiryDate: expiryDate ? expiryDate.date : null,
      network: 'sepolia' as EnsNetworkName,
    }),
  )

  const v2Transformed: MergedName[] = (v2Names || []).map(
    ({ name, expiryDate }) => ({
      name,
      expiryDate:
        expiryDate !== null && expiryDate !== undefined
          ? new Date(expiryDate * 1000)
          : null,
      network: 'namechainSepolia' as EnsNetworkName,
    }),
  )

  return [...v1Transformed, ...v2Transformed]
}
