import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

vi.mock('@/components/EntityBadge', () => ({
  EntityBadge: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
}))

/** Whether the registry's own name is still being read. */
let isRegistryPending = false
let registryName = 'parent.eth'
vi.mock('../../hooks/useRegistry', () => ({
  getRegistryInfoQueryOptions: () => ({
    queryKey: ['registryInfo'],
    queryFn: () =>
      isRegistryPending ? new Promise(() => {}) : { name: registryName },
  }),
}))

/** Whether the registry name's expiry read is still in flight, or fails. */
let isParentPending = false
let isParentReadFailing = false
vi.mock('@/features/profile/hooks/useRegistrationData', () => ({
  getRegistrationDataQueryOptions: ({ name }: { name: string }) => ({
    queryKey: ['registrationData', name],
    queryFn: () => {
      if (isParentPending) return new Promise(() => {})
      if (isParentReadFailing) throw new Error('read failed')
      return { expiry: name === 'parent.eth' ? inDays(100) : null }
    },
  }),
}))

const rowText = (name: string) =>
  screen.getByText(name).closest('tr')?.textContent ?? ''

describe('RegistryLabelsTable expiry', () => {
  // Midday UTC, so the local and UTC days agree and the day counts are exact.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'))
    isParentPending = false
    isRegistryPending = false
    isParentReadFailing = false
    registryName = 'parent.eth'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('dates each label by when it stops resolving, naming its registry’s name when that comes first', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <RegistryLabelsTable address="0x0000000000000000000000000000000000000001" />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('right')).toBeInTheDocument()
    expect(rowText('right')).toContain(
      'February 13, 2027 · Expires with parent.eth',
    )
    expect(rowText('beep')).toContain(
      'February 13, 2027 · Expires with parent.eth',
    )
    expect(rowText('soon')).toContain('November 15, 2026')
    expect(rowText('soon')).not.toContain('Expires with')
  })

  it('sorts by the date shown, so a label with none of its own sorts by its registry’s name', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <RegistryLabelsTable address="0x0000000000000000000000000000000000000001" />
      </QueryClientProvider>,
    )
    await screen.findByText('right')

    await userEvent.click(screen.getByRole('button', { name: /Expiration/ }))

    expect(
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent?.match(/^(right|beep|soon)/)?.[0]),
    ).toEqual(['soon', 'right', 'beep'])
  })

  it('shows Never for a label with no expiry and no name above, sorting it last', async () => {
    registryName = 'box'
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <RegistryLabelsTable address="0x0000000000000000000000000000000000000001" />
      </QueryClientProvider>,
    )
    await screen.findByText('right')
    expect(rowText('right')).toContain('Never')

    await userEvent.click(screen.getByRole('button', { name: /Expiration/ }))

    expect(
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent?.match(/^(right|beep|soon)/)?.[0]),
    ).toEqual(['soon', 'beep', 'right'])
  })

  it('says Expires with parent when the name above couldn’t be read', async () => {
    isParentReadFailing = true
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <RegistryLabelsTable address="0x0000000000000000000000000000000000000001" />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('right')).toBeInTheDocument()
    expect(rowText('right')).toContain('Expires with parent')
    expect(rowText('soon')).toContain('November 15, 2026')
  })

  it('waits for the registry’s name before showing any label’s expiry', async () => {
    isRegistryPending = true
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <RegistryLabelsTable address="0x0000000000000000000000000000000000000001" />
      </QueryClientProvider>,
    )

    await waitFor(() =>
      expect(queryClient.getQueryState(['registryLabels'])?.status).toBe(
        'success',
      ),
    )
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    expect(screen.getByText('Loading labels...')).toBeInTheDocument()
    expect(screen.queryByText('Never')).toBeNull()
  })

  it('waits for the names above before showing any label’s expiry', async () => {
    isParentPending = true
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <RegistryLabelsTable address="0x0000000000000000000000000000000000000001" />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(queryClient.getQueryState(['registryLabels'])?.status).toBe(
        'success',
      )
      expect(
        queryClient.isFetching({
          queryKey: ['registrationData', 'parent.eth'],
        }),
      ).toBe(1)
    })
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    expect(screen.getByText('Loading labels...')).toBeInTheDocument()
    expect(screen.queryByText('right')).toBeNull()
  })
})
