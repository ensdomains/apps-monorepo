import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SECONDS_PER_DAY } from '@/lib/constants/duration'
import { createTestQueryClient } from '@/test-utils/providers'
import type { RegistryLabelRow } from '../../hooks/useRegistryLabels'
import { RegistryLabelsTable } from './RegistryLabelsTable'

const inDays = (days: number) =>
  Math.floor(Date.now() / 1000) + days * SECONDS_PER_DAY

const label = (name: string, expiryDate: number | null): RegistryLabelRow => ({
  name,
  labelName: name.split('.')[0] ?? null,
  labelhash: `0x${name.length}`,
  expiryDate: expiryDate === null ? null : BigInt(expiryDate),
  roleHoldersCount: 1,
})

vi.mock('../../hooks/useRegistryLabels', () => ({
  REGISTRY_LABELS_PAGE_SIZE: 50,
  getRegistryLabelsQueryOptions: () => ({
    queryKey: ['registryLabels'],
    queryFn: () => ({
      labels: [
        label('right.parent.eth', null),
        label('beep.parent.eth', inDays(900)),
        label('soon.parent.eth', inDays(10)),
      ],
      totalCount: 3,
    }),
    initialPageParam: undefined,
    getNextPageParam: () => undefined,
  }),
}))

vi.mock('../../hooks/useRegistry', () => ({
  getRegistryInfoQueryOptions: () => ({
    queryKey: ['registryInfo'],
    queryFn: () => ({ name: 'parent.eth' }),
  }),
}))

vi.mock('@/features/profile/hooks/useRegistrationData', () => ({
  getRegistrationDataQueryOptions: ({ name }: { name: string }) => ({
    queryKey: ['registrationData', name],
    queryFn: () => ({ expiry: name === 'parent.eth' ? inDays(100) : null }),
  }),
}))

const rowText = (name: string) =>
  screen.getByText(name).closest('tr')?.textContent ?? ''

describe('RegistryLabelsTable expiry', () => {
  // Midday UTC, so the local and UTC days agree and the day counts are exact.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts each label down to when it stops resolving with its registry’s name', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <RegistryLabelsTable address="0x0000000000000000000000000000000000000001" />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('With its parent')).toBeInTheDocument()
    expect(rowText('right')).toMatch(/100 daysWith its parent/)
    expect(rowText('right')).not.toMatch(/Never/)
    expect(rowText('beep')).toMatch(
      /2 years \d+ daysStops resolving with its parent in 100 days/,
    )
    expect(rowText('soon')).toMatch(/10 days\d/)
  })
})
