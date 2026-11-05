import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SECONDS_PER_DAY } from '@/lib/constants/duration'
import { createTestQueryClient } from '@/test-utils/providers'
import { SubnameExpiryField } from './SubnameExpiryField'

const CHAKRI_EXPIRY = Math.floor(Date.now() / 1000) + 30 * SECONDS_PER_DAY

/** Unix-second expiries by name; null never expires. */
const EXPIRIES: Readonly<Record<string, number | null>> = {
  'right.chakri.eth': null,
  'chakri.eth': CHAKRI_EXPIRY,
}

vi.mock('@/features/profile/hooks/useRegistrationData', () => ({
  getRegistrationDataQueryOptions: ({ name }: { name: string }) => ({
    queryKey: ['registrationData', name],
    queryFn: () => ({ expiry: EXPIRIES[name] ?? null }),
  }),
}))

describe('SubnameExpiryField', () => {
  it('warns with the name above that expires first, though the parent never does', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <SubnameExpiryField
          parentName="right.chakri.eth"
          expiry={{ type: 'span', span: { type: 'years', years: 1 } }}
          onExpiryChange={vi.fn()}
        />
      </QueryClientProvider>,
    )

    expect(
      await screen.findByText(/^chakri\.eth expires on/),
    ).toHaveTextContent(
      'The subname stops resolving then, unless chakri.eth is renewed.',
    )
  })
})
