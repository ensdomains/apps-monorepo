/**
 * Pure helpers for the choose-primary-name dialog.
 *
 * Business logic kept outside the React component for testability.
 */

import type { Address } from 'viem'
import type { PrimaryNamePreparation } from '@/features/profile/service/primaryNamePreparation'
import { getCanonicalPrimaryName } from '@/features/profile/service/profileName'
import type { ProfileRecordsResult } from '@/features/profile/service/profileRecords'
import type { ServiceRecordSnapshot } from '@/features/profile/service/profileRecordTransactions'
import { resolveDomainLabel } from '../utils'

export const PRIMARY_NAME_PAGE_SIZE = 8

type PrimaryNameWritePreparation = Extract<
  PrimaryNamePreparation,
  { kind: 'update-eth-address' | 'setup-resolver' }
>

export type PrimaryNameConfirmation = PrimaryNameWritePreparation & {
  readonly name: string
  readonly ownerAddress: Address
}

export const isConfirmationForSelection = (
  confirmation: PrimaryNameConfirmation,
  name: string,
  ownerAddress: Address,
): boolean =>
  confirmation.name === name &&
  confirmation.ownerAddress.toLowerCase() === ownerAddress.toLowerCase()

export const needsPrimaryNameConfirmation = (
  preparation: PrimaryNamePreparation,
  confirmed?: PrimaryNameConfirmation,
): preparation is PrimaryNameWritePreparation =>
  preparation.kind !== 'ready' &&
  (!confirmed ||
    confirmed.kind !== preparation.kind ||
    confirmed.existingEthAddress?.toLowerCase() !==
      preparation.existingEthAddress?.toLowerCase())

export function getPrimaryNamePage<
  TDomain extends Parameters<typeof resolveDomainLabel>[0],
>(
  domains: readonly TDomain[],
  {
    searchQuery,
    page,
    reverseName,
  }: {
    readonly searchQuery: string
    readonly page: number
    readonly reverseName?: string | null
  },
) {
  const query = searchQuery.trim().normalize('NFC').toLowerCase()
  const filtered = domains
    .filter((domain) => resolveDomainLabel(domain).includes(query))
    .sort(
      (a, b) =>
        Number(resolveDomainLabel(b) === reverseName) -
        Number(resolveDomainLabel(a) === reverseName),
    )
  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / PRIMARY_NAME_PAGE_SIZE))
  const currentPage = Math.min(Math.max(1, page), totalPages)
  const offset = (currentPage - 1) * PRIMARY_NAME_PAGE_SIZE
  return {
    domains: filtered.slice(offset, offset + PRIMARY_NAME_PAGE_SIZE),
    total,
    totalPages,
    currentPage,
    rangeStart: total === 0 ? 0 : offset + 1,
    rangeEnd: Math.min(offset + PRIMARY_NAME_PAGE_SIZE, total),
  }
}

/** Never substitute a normalized twin for the raw name of an owned row. */
export function getPrimaryNameCandidates<
  TDomain extends Parameters<typeof resolveDomainLabel>[0],
>(domains: readonly TDomain[]): TDomain[] {
  return domains.filter((domain) => {
    const name = domain.name ?? domain.id
    return (
      getCanonicalPrimaryName(name) === name &&
      resolveDomainLabel(domain) === name
    )
  })
}

const ETH_COIN_TYPE = 60

/** Keep the live records when a primary-name claim needs a new resolver. */
export function recordsForPrimaryNameResolver(
  records: ProfileRecordsResult,
  ownerAddress: string,
): ServiceRecordSnapshot {
  return {
    texts: records.texts.map(({ key, value }) => ({ key, value })),
    coins: [
      ...records.coins
        .filter(({ coinType }) => coinType !== ETH_COIN_TYPE)
        .map(({ coinType, value }) => ({ coinType, value })),
      { coinType: ETH_COIN_TYPE, value: ownerAddress },
    ],
    contentHash: records.contentHash,
    abi: records.abi,
  }
}

/**
 * Nothing to submit yet: a step is in flight, or a query the branch decision
 * depends on (resolver write access, records) has not produced an answer.
 */
export function isConfirmBlocked({
  isSubmitting,
  isPreparing,
  resolverAccessSettled,
  recordsSettled,
  hasChanges,
  selectedName,
}: {
  readonly isSubmitting: boolean
  readonly isPreparing: boolean
  readonly resolverAccessSettled: boolean
  readonly recordsSettled: boolean
  readonly hasChanges: boolean
  readonly selectedName: string | null
}): boolean {
  return (
    isSubmitting ||
    isPreparing ||
    !resolverAccessSettled ||
    !recordsSettled ||
    !hasChanges ||
    !selectedName ||
    getCanonicalPrimaryName(selectedName) !== selectedName
  )
}
