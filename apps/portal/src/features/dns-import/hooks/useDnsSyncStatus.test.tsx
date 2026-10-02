import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type GetEnsOwnerReturnType,
  getEnsOwnerQueryOptions,
} from '@/features/profile/hooks/useEnsOwner'
import { createTestQueryClient, createTestWrapper } from '@/test-utils'

const getDnsOwnerMock = vi.fn()

vi.mock('@ensdomains/ensjs/dns', () => ({
  getDnsOwner: (...args: unknown[]) => getDnsOwnerMock(...args),
}))

const { useDnsSyncStatus } = await import('./useDnsSyncStatus')

const MANAGER = '0x0b08dA7068b73A579Bd5E8a8290ff8afd37bc32A' as const
const DNS_OWNER = '0x5eb3Bc0a489C5A8288765d2336659EbCA68FCd00' as const
const VIEWER = '0x238A8F792dFA6033814B18618aD4100654aeef01' as const
const REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as const

const renderStatus = (
  params: Partial<Parameters<typeof useDnsSyncStatus>[0]> = {},
  queryClient = createTestQueryClient(),
) =>
  renderHook(
    () =>
      useDnsSyncStatus({
        name: 'example.xyz',
        manager: MANAGER,
        protocolVersion: 'ENSv1',
        connectedAddress: undefined,
        ...params,
      }),
    { wrapper: createTestWrapper(queryClient) },
  )

describe('useDnsSyncStatus', () => {
  beforeEach(() => {
    getDnsOwnerMock.mockReset()
  })

  it('is not-applicable for .eth names and never queries DNS', async () => {
    const { result } = renderStatus({ name: 'example.eth' })

    expect(result.current.status).toBe('not-applicable')
    await waitFor(() => expect(getDnsOwnerMock).not.toHaveBeenCalled())
  })

  it('is not-applicable for v2 names', () => {
    const { result } = renderStatus({ protocolVersion: 'ENSv2' })

    expect(result.current.status).toBe('not-applicable')
    expect(getDnsOwnerMock).not.toHaveBeenCalled()
  })

  it('is not-applicable when the record is unreadable (null owner)', async () => {
    getDnsOwnerMock.mockResolvedValue(null)

    const { result } = renderStatus()

    await waitFor(() => expect(getDnsOwnerMock).toHaveBeenCalled())
    expect(result.current.status).toBe('not-applicable')
    // Detection uses the non-strict lookup: failures mean "nothing to act on".
    expect(getDnsOwnerMock).toHaveBeenCalledWith({
      name: 'example.xyz',
      strict: false,
    })
  })

  it('is in-sync when the record matches the manager', async () => {
    getDnsOwnerMock.mockResolvedValue(MANAGER)

    const { result } = renderStatus()

    await waitFor(() => expect(result.current.status).toBe('in-sync'))
  })

  it('is syncable when the connected wallet is the DNS owner but not the manager', async () => {
    getDnsOwnerMock.mockResolvedValue(DNS_OWNER)

    const { result } = renderStatus({ connectedAddress: DNS_OWNER })

    await waitFor(() => expect(result.current.status).toBe('syncable'))
    expect(result.current.dnsOwner).toBe(DNS_OWNER)
  })

  it('is out-of-sync for any other viewer', async () => {
    getDnsOwnerMock.mockResolvedValue(DNS_OWNER)

    const { result } = renderStatus({ connectedAddress: VIEWER })

    await waitFor(() => expect(result.current.status).toBe('out-of-sync'))
  })

  it('refreshes the manager alongside the DNS record', async () => {
    getDnsOwnerMock.mockResolvedValue(DNS_OWNER)
    const queryClient = createTestQueryClient()
    const managerQueryKey = getEnsOwnerQueryOptions({
      name: 'example.xyz',
    }).queryKey
    const manager: GetEnsOwnerReturnType = {
      owner: MANAGER,
      registryAddress: REGISTRY,
      protocolVersion: 'ENSv1',
    }
    queryClient.setQueryData(managerQueryKey, manager)

    const { result } = renderStatus({ connectedAddress: VIEWER }, queryClient)

    await waitFor(() => expect(result.current.status).toBe('out-of-sync'))
    expect(getDnsOwnerMock).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.refresh()
    })

    // The manager is just as likely to be the side that moved, so refreshing
    // only DNS would re-compare against a stale manager and keep the warning up.
    await waitFor(() => expect(getDnsOwnerMock).toHaveBeenCalledTimes(2))
    expect(queryClient.getQueryState(managerQueryKey)?.isInvalidated).toBe(true)
  })
})
