import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MigrationStatus } from '@/features/migration/hooks/useMigrationStatus'
import { createTestWrapper } from '@/test-utils'
import { ProtocolRow, V1ProtocolRow } from './ProtocolRow'

const HOLDER = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'

let verdict: MigrationStatus = { migratable: false }
const queriedNames: string[] = []

// The query runs through real react-query, so only the fetch is stubbed.
vi.mock('@/features/migration/hooks/useMigrationStatus', () => ({
  getMigrationStatusQueryOptions: ({ name }: { name: string }) => ({
    queryKey: ['get-migration-status', { name }],
    queryFn: async () => {
      queriedNames.push(name)
      return verdict
    },
  }),
}))

describe('ProtocolRow', () => {
  it('says a migratable v1 name can be migrated', () => {
    render(
      <ProtocolRow
        protocolVersion="ENSv1"
        migration={{
          migratable: true,
          tokenHolder: HOLDER,
          tokenType: 'unlocked',
        }}
      />,
    )

    expect(screen.getByText(/ENSv1: Can be migrated/)).toBeInTheDocument()
  })

  it('says a v1 name the classifier rejects cannot be migrated', () => {
    render(
      <ProtocolRow protocolVersion="ENSv1" migration={{ migratable: false }} />,
    )

    expect(screen.getByText(/ENSv1: Cannot be migrated/)).toBeInTheDocument()
  })

  it('shows only the version while the verdict is loading', () => {
    render(
      <ProtocolRow
        protocolVersion="ENSv1"
        migration={{ migratable: false }}
        isLoading
      />,
    )

    expect(screen.queryByText(/migrated/)).not.toBeInTheDocument()
  })
})

describe('V1ProtocolRow', () => {
  it('fetches the verdict for the name itself, wallet or not', async () => {
    verdict = { migratable: false }

    render(<V1ProtocolRow name="locked.eth" />, {
      wrapper: createTestWrapper(),
    })

    expect(
      await screen.findByText(/ENSv1: Cannot be migrated/),
    ).toBeInTheDocument()
    expect(queriedNames).toContain('locked.eth')
  })

  it('says a migratable name can be migrated', async () => {
    verdict = { migratable: true, tokenHolder: HOLDER, tokenType: 'unlocked' }

    render(<V1ProtocolRow name="unlocked.eth" />, {
      wrapper: createTestWrapper(),
    })

    expect(
      await screen.findByText(/ENSv1: Can be migrated/),
    ).toBeInTheDocument()
  })
})
