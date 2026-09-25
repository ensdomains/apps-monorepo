import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProtocolRow } from './ProtocolRow'

const HOLDER = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'

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
