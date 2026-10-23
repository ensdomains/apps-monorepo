// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { type Address, labelhash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const PARENT_REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const DEPLOYED: Address = '0x2222222222222222222222222222222222222222'

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useWalletClient: () => ({
    data: {
      account: { address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    },
  }),
  usePublicClient: () => ({}),
}))

vi.mock('@/features/registry/utils/signer.helpers', () => ({
  createEOASigner: () => ({}),
}))

const setRegistryParent = vi.fn()
vi.mock(
  '@/features/registry/helpers/setRegistryParent',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/features/registry/helpers/setRegistryParent')
    >()),
    setRegistryParent: (params: unknown) => setRegistryParent(params),
  }),
)

const { useRegistryParentStep } = await import('./useRegistryParentStep')

const wrapper = ({ children }: { readonly children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
)

const render = (name: string) => {
  const next = vi.fn()
  const { result } = renderHook(
    () =>
      useRegistryParentStep({
        name,
        parentRegistry: PARENT_REGISTRY,
        id: 'tx-set-registry-parent',
        deployedRegistryRef: { current: DEPLOYED },
        next,
      }),
    { wrapper },
  )
  return { result, next }
}

beforeEach(() => {
  setRegistryParent.mockReset()
})

describe('useRegistryParentStep', () => {
  it('claims the parent before linking, and links only once the claim is done', async () => {
    setRegistryParent.mockResolvedValue({ txId: 'tx', hash: '0x' })
    const { result, next } = render('koala.eth')

    expect(result.current.steps).toHaveLength(1)
    act(() => result.current.start())

    await waitFor(() => expect(setRegistryParent).toHaveBeenCalledTimes(1))
    expect(setRegistryParent).toHaveBeenCalledWith(
      expect.objectContaining({
        registry: DEPLOYED,
        parentRegistry: PARENT_REGISTRY,
        label: 'koala',
      }),
    )
    expect(next).not.toHaveBeenCalled()

    // The modal links through the step's onDone, after the claim confirms.
    expect(result.current.steps[0]?.onDone).toBe(next)
  })

  it('claims a registry once, but retries after a failure', async () => {
    setRegistryParent.mockRejectedValueOnce(new Error('rejected'))
    setRegistryParent.mockResolvedValue({ txId: 'tx', hash: '0x' })
    const { result } = render('koala.eth')

    act(() => result.current.start())
    await waitFor(() => expect(result.current.isPending).toBe(false))
    act(() => result.current.start())
    await waitFor(() => expect(setRegistryParent).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.isPending).toBe(false))

    act(() => result.current.start())
    expect(setRegistryParent).toHaveBeenCalledTimes(2)
  })

  it('skips the step for an encoded label', () => {
    const { result, next } = render(`[${labelhash('koala').slice(2)}].eth`)

    expect(result.current.steps).toEqual([])
    result.current.start()
    expect(next).toHaveBeenCalledTimes(1)
    expect(setRegistryParent).not.toHaveBeenCalled()
  })
})
