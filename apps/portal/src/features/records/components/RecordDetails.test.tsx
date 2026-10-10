import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProtocolVersion } from '@/utils/types'
import type { NameRecord } from './RecordsTable/columns'

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useEnsResolver: () => ({ data: undefined, isLoading: false, error: null }),
}))

vi.mock('@/features/history/components/HistoryTimeline', () => ({
  HistoryTimeline: ({
    name,
    scope,
  }: {
    name: string
    scope: readonly string[]
  }) => <div data-testid="timeline">{`${name}: ${scope.join(', ')}`}</div>,
}))

const recordHistory = vi.fn()
vi.mock('@/features/records/hooks/useRecordHistory', () => ({
  getRecordHistoryQueryOptions: (params: { name: string; key: string }) => ({
    queryKey: ['record-history-test', params],
    queryFn: () => recordHistory(params),
  }),
}))

const { RecordDetails } = await import('./RecordDetails')

const TEXT_RECORD: NameRecord = {
  type: 'text',
  key: 'url',
  value: 'https://ens.domains',
}

const renderDetails = (protocolVersion: ProtocolVersion) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RecordDetails
        name="example.eth"
        record={TEXT_RECORD}
        protocolVersion={protocolVersion}
      />
    </QueryClientProvider>,
  )

describe('RecordDetails history', () => {
  it('reads an ENSv2 record’s history from the paged timeline, scoped to its event types', () => {
    renderDetails('ENSv2')

    expect(screen.getByTestId('timeline')).toHaveTextContent(
      'example.eth: TextUpdated, TextChanged',
    )
    expect(recordHistory).not.toHaveBeenCalled()
  })

  it('keeps reading an ENSv1 record’s history from the subgraph', async () => {
    recordHistory.mockResolvedValue([])
    renderDetails('ENSv1')

    expect(
      await screen.findByText('No history available for this record.'),
    ).toBeInTheDocument()
    expect(recordHistory).toHaveBeenCalledWith({
      name: 'example.eth',
      key: 'texts',
    })
    expect(screen.queryByTestId('timeline')).not.toBeInTheDocument()
  })
})
