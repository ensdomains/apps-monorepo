import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { createTestQueryClient } from '@/test-utils'
import { DnsClaimableMessage } from './DnsClaimableMessage'

const ADDRESS_LIKE_NAME = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045.xyz'
const RESOLVED = '0x1111111111111111111111111111111111111111'

let resolvedAddress: string | null = null
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../hooks/useDnsOffchainName', () => ({
  useDnsOffchainName: () => ({ isLoading: false, resolvedAddress }),
}))
vi.mock('../queries/getDnsTldStatus', () => ({
  getDnsTldStatusQueryOptions: () => ({
    queryKey: ['dns-tld-status'],
    queryFn: () => ({ type: 'standard' }),
  }),
}))

it.each([
  {
    name: 'example.xyz',
    resolved: null,
    button: 'Import name',
    isOffered: true,
  },
  {
    name: ADDRESS_LIKE_NAME,
    resolved: null,
    button: 'Import name',
    isOffered: false,
  },
  {
    name: 'example.xyz',
    resolved: RESOLVED,
    button: 'Import onchain',
    isOffered: true,
  },
  {
    name: ADDRESS_LIKE_NAME,
    resolved: RESOLVED,
    button: 'Import onchain',
    isOffered: false,
  },
])(
  'offers $button for $name: $isOffered',
  async ({ name, resolved, button, isOffered }) => {
    resolvedAddress = resolved
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <DnsClaimableMessage name={name} />
      </QueryClientProvider>,
    )

    await waitFor(() =>
      expect(screen.queryByText('Checking availability...')).toBeNull(),
    )
    expect(screen.queryByRole('button', { name: button }) !== null).toBe(
      isOffered,
    )
  },
)
