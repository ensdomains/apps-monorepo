import { encodeLabelhash } from '@ensdomains/ensjs/utils'
import { ok, okAsync } from 'neverthrow'
import { type Address, labelhash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACCOUNT: Address = '0x0000000000000000000000000000000000000011'
const OTHER: Address = '0x0000000000000000000000000000000000000022'

const mocks = vi.hoisted(() => ({
  getOwner: vi.fn(),
  getWrapperData: vi.fn(),
  getV1NameState: vi.fn(),
  getSubnamesCount: vi.fn(),
}))
vi.mock('@ensdomains/ensjs/public/v1', () => ({
  getOwner: mocks.getOwner,
  getWrapperData: mocks.getWrapperData,
}))
vi.mock('@/lib/wagmi/helpers', () => ({ safeGetClient: () => ok({}) }))
vi.mock('@/features/transfer/v1/getV1NameState', () => ({
  getV1NameState: mocks.getV1NameState,
}))
vi.mock('@/features/profile/hooks/useSubnames', () => ({
  getSubnamesCount: mocks.getSubnamesCount,
}))

const { prepareDeleteV1SubnameSubmit } = await import(
  './prepareDeleteV1SubnameSubmit'
)

const LABELHASH = labelhash('sub')
const SUBNAME = `${encodeLabelhash(LABELHASH)}.parent.eth`

const parentHeld = (isWrapped: boolean, owner: Address = ACCOUNT) =>
  okAsync({
    subject: isWrapped
      ? {
          kind: 'v1-wrapped',
          owner,
          fuses: {
            cannotTransfer: false,
            cannotSetResolver: false,
            cannotUnwrap: false,
            cannotCreateSubdomain: false,
            parentCannotControl: false,
          },
          expiry: null,
        }
      : { kind: 'v1-registry', owner },
    registration: null,
    resolverAddress: null,
    parent: null,
    ancestorRegistration: null,
  })

const submit = (target: 'registry' | 'wrapper' | 'wrap-then-delete') =>
  prepareDeleteV1SubnameSubmit({
    parentName: 'parent.eth',
    labelhash: LABELHASH,
    labelName: 'sub',
    account: ACCOUNT,
    target,
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getV1NameState.mockReturnValue(parentHeld(false))
  mocks.getOwner.mockResolvedValue({ owner: OTHER, ownershipLevel: 'registry' })
  mocks.getSubnamesCount.mockReturnValue(okAsync(0))
})

describe('prepareDeleteV1SubnameSubmit', () => {
  // WEB-1458: a row served as a literal `[<hex>]` label must not be re-hashed.
  it('reads the subname by the row’s labelhash, not its served name', async () => {
    await submit('registry')

    expect(mocks.getOwner).toHaveBeenCalledWith({}, { name: SUBNAME })
    expect(mocks.getSubnamesCount).toHaveBeenCalledWith({
      name: SUBNAME,
      protocolVersion: 'ENSv1',
    })
  })

  it('confirms an unwrapped subname without reading the wrapper', async () => {
    expect((await submit('registry'))._unsafeUnwrap()).toBe('registry')
    expect(mocks.getWrapperData).not.toHaveBeenCalled()
  })

  it('reads the wrapper only for a wrapped subname', async () => {
    mocks.getV1NameState.mockReturnValue(parentHeld(true))
    mocks.getOwner.mockResolvedValue({
      owner: OTHER,
      ownershipLevel: 'nameWrapper',
    })
    mocks.getWrapperData.mockResolvedValue({
      fuses: { parent: { PARENT_CANNOT_CONTROL: true } },
    })

    const result = await submit('wrapper')

    expect(mocks.getWrapperData).toHaveBeenCalledWith({}, { name: SUBNAME })
    expect(result._unsafeUnwrapErr().cause).toEqual({
      kind: 'refused',
      reason: 'emancipated',
    })
  })

  it('refuses a subname that is already gone', async () => {
    mocks.getOwner.mockResolvedValue(null)

    expect((await submit('registry'))._unsafeUnwrapErr().cause).toEqual({
      kind: 'already-deleted',
    })
  })

  it('refuses a subname that gained subnames since the list loaded', async () => {
    mocks.getSubnamesCount.mockReturnValue(okAsync(1))

    expect((await submit('registry'))._unsafeUnwrapErr().cause).toEqual({
      kind: 'refused',
      reason: 'has-subnames',
    })
  })

  it('refuses when a different write is needed now', async () => {
    mocks.getV1NameState.mockReturnValue(parentHeld(true))

    expect((await submit('registry'))._unsafeUnwrapErr().cause).toEqual({
      kind: 'changed',
      target: 'wrap-then-delete',
    })
  })

  it('refuses an account that no longer holds the parent', async () => {
    mocks.getV1NameState.mockReturnValue(parentHeld(false, OTHER))

    expect((await submit('registry'))._unsafeUnwrapErr().cause).toEqual({
      kind: 'refused',
      reason: 'not-holder',
    })
    expect(mocks.getOwner).not.toHaveBeenCalled()
  })
})
