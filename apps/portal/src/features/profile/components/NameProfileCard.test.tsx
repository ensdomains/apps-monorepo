import { QueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { errAsync } from 'neverthrow'
import { expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils'
import { getProfileQueryOptions } from '../hooks/useProfile'
import { getRecords } from '../hooks/useRecords'
import { NameProfileCard } from './NameProfileCard'

vi.mock('../hooks/useRecords', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useRecords')>()),
  getRecords: vi.fn(() => errAsync(new Error('Unexpected duplicate read'))),
}))
vi.mock('./NameAvatar', () => ({ NameAvatar: () => null }))

it('renders the loader profile data without starting a separate record query', () => {
  const client = new QueryClient()
  const name = 'jesse.base.eth'
  const options = getProfileQueryOptions({ name })
  client.setQueryData(options.queryKey, {
    records: {
      texts: [{ key: 'description', value: 'base.eth builder #001' }],
      coins: [],
      contentHash: null,
      abi: null,
      resolverAddress: '0xde9049636F4a1dfE0a64d1bFe3155C0A14C54F31',
    },
  })
  const { unmount } = render(<NameProfileCard name={name} stacked />, {
    wrapper: createTestWrapper(client),
  })
  expect(screen.getByText('base.eth builder #001')).toBeInTheDocument()
  expect(getRecords).not.toHaveBeenCalled()
  unmount()
  client.clear()
})
