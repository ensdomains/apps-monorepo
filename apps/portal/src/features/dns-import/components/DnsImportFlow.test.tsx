import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '@/test-utils'
import { DnsImportFlow } from './DnsImportFlow'

vi.mock('@/features/profile/hooks/useEnsOwner', () => ({
  getEnsOwnerQueryOptions: () => ({
    queryKey: ['ens-owner'],
    queryFn: () => null,
  }),
}))
vi.mock('../queries/getDnsTldStatus', () => ({
  getDnsTldStatusQueryOptions: () => ({
    queryKey: ['dns-tld-status'],
    queryFn: () => ({ type: 'standard' }),
  }),
}))

describe('DnsImportFlow', () => {
  it('refuses a name that reads like a wallet address', () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <DnsImportFlow
          name="0xd8da6bf26964af9d7eed9e03e53415d37aa96045.xyz"
          search={{ type: 'onchain', step: 'start' }}
          onSearchChange={() => {}}
        />
      </QueryClientProvider>,
    )

    expect(
      screen.getByText(/look like a wallet address can’t be imported here/),
    ).toBeInTheDocument()
  })
})
