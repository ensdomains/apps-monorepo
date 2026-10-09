import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils/providers'

const mockGraphqlRequest = vi.fn()
vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: { request: mockGraphqlRequest },
}))

const { RegistryLabelsTable } = await import('./RegistryLabelsTable')

const REGISTRY: Address = '0xD4eBcBdF463C9c45784603Db0dDD499BC44A8B4a'

const indexerPage = (from: number, count: number, totalCount: number) => ({
  registry: {
    labelConnection: {
      totalCount,
      pageInfo: {
        hasNextPage: from + count < totalCount,
        endCursor: `cursor-${from + count}`,
      },
      edges: Array.from({ length: count }, (_, i) => ({
        node: {
          name: `label${from + i}.eth`,
          labelName: `label${from + i}`,
          labelhash: `0x${(from + i).toString(16).padStart(64, '0')}`,
          expiryDate: null,
          roleHoldersCount: 0,
        },
      })),
    },
  },
})

const renderTable = () =>
  render(<RegistryLabelsTable address={REGISTRY} />, {
    wrapper: createTestWrapper(),
  })

const bodyRows = () => screen.getAllByRole('row').length - 1

describe('RegistryLabelsTable', () => {
  beforeEach(() => {
    mockGraphqlRequest.mockReset()
  })

  it('shows the first page and how many labels the registry has', async () => {
    mockGraphqlRequest.mockResolvedValue(indexerPage(0, 100, 10531))

    renderTable()

    expect(await screen.findByText('Showing 100 of 10531')).toBeInTheDocument()
    expect(bodyRows()).toBe(100)
  })

  it('loads the next page on More', async () => {
    const user = userEvent.setup()
    mockGraphqlRequest
      .mockResolvedValueOnce(indexerPage(0, 100, 250))
      .mockResolvedValueOnce(indexerPage(100, 100, 250))
    renderTable()
    await screen.findByText('Showing 100 of 250')

    await user.click(screen.getByRole('button', { name: 'More' }))

    expect(await screen.findByText('Showing 200 of 250')).toBeInTheDocument()
    expect(mockGraphqlRequest.mock.calls[1]?.[1]).toMatchObject({
      after: 'cursor-100',
    })
    expect(bodyRows()).toBe(200)
  })

  it('loads every remaining page on All, then drops the loader', async () => {
    const user = userEvent.setup()
    mockGraphqlRequest
      .mockResolvedValueOnce(indexerPage(0, 100, 250))
      .mockResolvedValueOnce(indexerPage(100, 100, 250))
      .mockResolvedValueOnce(indexerPage(200, 50, 250))
    renderTable()
    await screen.findByText('Showing 100 of 250')

    await user.click(screen.getByRole('button', { name: 'All' }))

    expect(await screen.findByText('label249')).toBeInTheDocument()
    expect(bodyRows()).toBe(250)
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument()
  })

  it('shows no loader when every label fits the first page', async () => {
    mockGraphqlRequest.mockResolvedValue(indexerPage(0, 10, 10))

    renderTable()

    expect(await screen.findByText('label9')).toBeInTheDocument()
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument()
  })

  it('keeps the rows and says so when a page fails', async () => {
    const user = userEvent.setup()
    mockGraphqlRequest
      .mockResolvedValueOnce(indexerPage(0, 100, 250))
      .mockRejectedValueOnce(new Error('indexer unavailable'))
    renderTable()
    await screen.findByText('Showing 100 of 250')

    await user.click(screen.getByRole('button', { name: 'More' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t load more.',
    )
    expect(bodyRows()).toBe(100)
  })
})
