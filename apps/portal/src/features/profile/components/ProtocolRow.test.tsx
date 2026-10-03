import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProtocolRow, V1ProtocolRow } from './ProtocolRow'

const HOLDER = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'

let owner = { isOwner: true, isLoading: false }
let migration: {
  data: unknown
  isLoading: boolean
  error: unknown
} = { data: undefined, isLoading: false, error: null }

vi.mock('@/features/ownership/hooks/useIsNameOwner', () => ({
  useIsNameOwner: () => owner,
}))
vi.mock('@/features/migration/hooks/useMigrationStatus', () => ({
  useMigrationStatus: () => migration,
}))

describe('ProtocolRow', () => {
  it('says an eligible v1 name can be upgraded', () => {
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

    expect(screen.getByText(/ENSv1: Can be upgraded/)).toBeInTheDocument()
  })

  it('says a v1 name the classifier rejects cannot be upgraded', () => {
    render(
      <ProtocolRow protocolVersion="ENSv1" migration={{ migratable: false }} />,
    )

    expect(screen.getByText(/ENSv1: Cannot be upgraded/)).toBeInTheDocument()
  })

  it('shows the version alone when there is no verdict', () => {
    render(<ProtocolRow protocolVersion="ENSv2" />)

    expect(screen.getByText('ENSv2')).toBeInTheDocument()
    expect(screen.queryByText(/upgrad/)).not.toBeInTheDocument()
  })
})

describe('V1ProtocolRow', () => {
  beforeEach(() => {
    owner = { isOwner: true, isLoading: false }
    migration = { data: undefined, isLoading: false, error: null }
  })

  it('tells the owner their name cannot be upgraded', () => {
    migration.data = { migratable: false }

    render(<V1ProtocolRow name="locked.eth" />)

    expect(screen.getByText(/ENSv1: Cannot be upgraded/)).toBeInTheDocument()
  })

  it('tells the owner their name can be upgraded', () => {
    migration.data = {
      migratable: true,
      tokenHolder: HOLDER,
      tokenType: 'unwrapped',
    }

    render(<V1ProtocolRow name="plain.eth" />)

    expect(screen.getByText(/ENSv1: Can be upgraded/)).toBeInTheDocument()
  })

  // Migratability is the owner's business; a visitor sees only the version.
  it('keeps the verdict from anyone who does not own the name', () => {
    owner = { isOwner: false, isLoading: false }
    migration.data = { migratable: false }

    render(<V1ProtocolRow name="someone-else.eth" />)

    expect(screen.getByText('ENSv1')).toBeInTheDocument()
    expect(screen.queryByText(/upgrad/)).not.toBeInTheDocument()
  })

  it('says nothing about upgrade eligibility until ownership is known', () => {
    owner = { isOwner: false, isLoading: true }

    render(<V1ProtocolRow name="plain.eth" />)

    expect(screen.queryByText(/upgrad/)).not.toBeInTheDocument()
  })

  it('shows the check in progress rather than a bare version', () => {
    migration.isLoading = true

    render(<V1ProtocolRow name="plain.eth" />)

    expect(screen.getByText(/Checking upgrade eligibility/)).toBeInTheDocument()
  })

  it('says the check failed rather than falling back to a bare version', () => {
    migration.error = new Error('subgraph down')

    render(<V1ProtocolRow name="plain.eth" />)

    expect(
      screen.getByText(/Failed to check upgrade eligibility/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Can be upgraded/)).not.toBeInTheDocument()
  })
})
