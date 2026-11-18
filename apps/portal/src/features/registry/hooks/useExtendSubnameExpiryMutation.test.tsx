import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { labelhash } from 'viem'
import { expect, it, vi } from 'vitest'
import { getRegistrationDataQueryOptions } from '@/features/profile/hooks/useRegistrationData'
import { resourceIdFromChainValue } from '@/lib/resource/resourceId'
import { createTestQueryClient } from '@/test-utils/providers'

vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: { startTransaction: () => 'tx' },
  waitForTransaction: () => Promise.resolve(),
}))
vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useWalletClient: () => ({ data: { account: {} } }),
  usePublicClient: () => ({}),
}))
vi.mock('../utils/extend-subname-expiry.helpers', () => ({
  prepareExtendSubnameExpiryTransaction: () => ({}),
}))
vi.mock('@/utils/query/pollForIndexerSync', () => ({
  pollForIndexerSync: ({
    invalidateQueries,
  }: {
    readonly invalidateQueries: () => Promise<void>
  }) => invalidateQueries(),
}))

const { useExtendSubnameExpiryMutation } = await import(
  './useExtendSubnameExpiryMutation'
)

it('refreshes the changed subname’s own expiry once indexed, and no other', async () => {
  const queryClient = createTestQueryClient()
  const changed = getRegistrationDataQueryOptions({
    name: 'admin.chakri.eth',
  }).queryKey
  const sibling = getRegistrationDataQueryOptions({
    name: 'beep.chakri.eth',
  }).queryKey
  queryClient.setQueryData(changed, null)
  queryClient.setQueryData(sibling, null)
  const { result } = renderHook(
    () =>
      useExtendSubnameExpiryMutation({
        name: 'chakri.eth',
        registryAddress: '0x8C7c50D4400CE8DE9Bc7534CEDf9a7Cc50d87F01',
      }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    },
  )

  await result.current.mutateAsync({
    subname: 'admin.chakri.eth',
    resourceId: resourceIdFromChainValue(labelhash('admin'))._unsafeUnwrap(),
    expires: 4_000_000_000n,
    id: 'tx',
  })

  await vi.waitFor(() =>
    expect(queryClient.getQueryState(changed)?.isInvalidated).toBe(true),
  )
  expect(queryClient.getQueryState(sibling)?.isInvalidated).toBe(false)
})
