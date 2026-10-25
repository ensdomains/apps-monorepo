import { errAsync, ok, okAsync } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const V2_RESOLVER: Address = '0x00000000000000000000000000000000000000cc'
const REGISTRY: Address = '0x00000000000000000000000000000000000000bb'

const mockGetResolver = vi.fn()
vi.mock('@ensdomains/ensjs/public', () => ({ getResolver: mockGetResolver }))
vi.mock('@/lib/wagmi/helpers', () => ({ safeGetClient: () => ok({}) }))

const mockGetIsV1SubnameTaken = vi.fn()
vi.mock('@/features/profile/hooks/useSubnames', () => ({
  getIsV1SubnameTaken: (...params: unknown[]) =>
    mockGetIsV1SubnameTaken(...params),
}))

const { prepareCreateSubnameSubmit } = await import(
  './prepareCreateSubnameSubmit'
)

const submit = (
  target: Parameters<typeof prepareCreateSubnameSubmit>[0]['target'],
) =>
  prepareCreateSubnameSubmit({
    name: 'parent.eth',
    label: 'sub',
    target,
  })

beforeEach(() => {
  mockGetResolver.mockReset()
  mockGetIsV1SubnameTaken.mockReset()
})

describe('prepareCreateSubnameSubmit', () => {
  const V1 = { protocol: 'ENSv1', isWrapped: false } as const

  // The V1 intent owns its resolver: the Universal Resolver would answer a V1
  // parent with the V2 mirror resolver.
  it('passes an available V1 subname through without a resolver lookup', async () => {
    mockGetIsV1SubnameTaken.mockReturnValue(okAsync(false))

    const result = await submit(V1)

    expect(result._unsafeUnwrap()).toEqual(V1)
    expect(mockGetResolver).not.toHaveBeenCalled()
  })

  it('refuses a V1 label the fresh check finds taken', async () => {
    mockGetIsV1SubnameTaken.mockReturnValue(okAsync(true))

    const result = await submit(V1)

    expect(result._unsafeUnwrapErr()).toMatchObject({
      _tag: 'PrepareCreateSubnameSubmitError',
      cause: { kind: 'subnameTaken', subname: 'sub.parent.eth' },
    })
  })

  it('refuses a V1 label it could not check', async () => {
    const { TaggedError } = await import('@ens-apps/utils/neverthrow')
    class GetIsV1SubnameTakenError extends TaggedError(
      'GetIsV1SubnameTakenError',
    )<{ cause: unknown }> {}
    const lookupError = new GetIsV1SubnameTakenError({
      cause: new Error('rpc down'),
    })
    mockGetIsV1SubnameTaken.mockReturnValue(errAsync(lookupError))

    const result = await submit(V1)

    expect(result._unsafeUnwrapErr()).toMatchObject({
      _tag: 'PrepareCreateSubnameSubmitError',
      message: 'Could not check whether sub.parent.eth is already registered',
      cause: lookupError,
    })
  })

  it('keeps V2 on the parent resolver, without the V1 label recheck', async () => {
    mockGetResolver.mockResolvedValue(V2_RESOLVER)

    const result = await submit({
      protocol: 'ENSv2',
      registryAddress: REGISTRY,
    })

    expect(result._unsafeUnwrap()).toEqual({
      protocol: 'ENSv2',
      registryAddress: REGISTRY,
      resolverAddress: V2_RESOLVER,
    })
    expect(mockGetIsV1SubnameTaken).not.toHaveBeenCalled()
  })
})
