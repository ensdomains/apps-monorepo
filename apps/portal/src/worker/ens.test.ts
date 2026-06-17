import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockResolveEnsOwner = vi.fn()

vi.mock('@ensdomains/ensjs/public', () => ({
  getRecords: vi.fn(),
}))

vi.mock('@/utils/ens/resolveEnsOwner', () => ({
  resolveEnsOwner: (...args: unknown[]) => mockResolveEnsOwner(...args),
}))

const { resolveOwner } = await import('./ens')

const OWNER = '0x1111111111111111111111111111111111111111'
const client = {} as never

describe('resolveOwner (worker)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns just the owner address from the shared resolver', async () => {
    mockResolveEnsOwner.mockResolvedValueOnce({
      owner: OWNER,
      registryAddress: '0x00000000000000000000000000000000000ce610',
      protocolVersion: 'ENSv2',
    })

    const owner = await resolveOwner(client, 'alice.ledgit.eth')

    expect(owner).toBe(OWNER)
    expect(mockResolveEnsOwner).toHaveBeenCalledWith(client, 'alice.ledgit.eth')
  })

  it('returns null when the name is unowned (renders as "available")', async () => {
    mockResolveEnsOwner.mockResolvedValueOnce(null)

    const owner = await resolveOwner(client, 'unclaimed.eth')

    expect(owner).toBeNull()
  })

  it('returns null when the shared resolver throws', async () => {
    mockResolveEnsOwner.mockRejectedValueOnce(new Error('rpc down'))

    const owner = await resolveOwner(client, 'ledgit.eth')

    expect(owner).toBeNull()
  })
})
