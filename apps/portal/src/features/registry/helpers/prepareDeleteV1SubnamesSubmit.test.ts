import { encodeLabelhash } from '@ensdomains/ensjs/utils'
import { ok, okAsync } from 'neverthrow'
import { type Address, labelhash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { V1SubnameDeleteTarget } from '../utils/delete-v1-subname.helpers'

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

const { prepareDeleteV1SubnamesSubmit } = await import(
  './prepareDeleteV1SubnamesSubmit'
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

const wrapperData = ({
  isEmancipated = false,
  isLocked = false,
}: {
  readonly isEmancipated?: boolean
  readonly isLocked?: boolean
}) => ({
  fuses: {
    parent: { PARENT_CANNOT_CONTROL: isEmancipated },
    child: {
      CANNOT_UNWRAP: isLocked,
      CANNOT_TRANSFER: false,
      CANNOT_SET_RESOLVER: false,
      CANNOT_SET_TTL: false,
    },
  },
})

const submit = (target: V1SubnameDeleteTarget) =>
  prepareDeleteV1SubnamesSubmit({
    parentName: 'parent.eth',
    account: ACCOUNT,
    deletes: [{ labelhash: LABELHASH, labelName: 'sub', target }],
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getV1NameState.mockReturnValue(parentHeld(false))
  mocks.getOwner.mockResolvedValue({ owner: OTHER, ownershipLevel: 'registry' })
  mocks.getSubnamesCount.mockReturnValue(okAsync(0))
})

describe('prepareDeleteV1SubnamesSubmit', () => {
  // WEB-1458: a row served as a literal `[<hex>]` label must not be re-hashed.
  it('reads the subname by the row’s labelhash, not its served name', async () => {
    await submit('registry')

    expect(mocks.getOwner).toHaveBeenCalledWith({}, { name: SUBNAME })
    // Expired children count too, as on the row: they still resolve.
    expect(mocks.getSubnamesCount).toHaveBeenCalledWith({
      name: SUBNAME,
      protocolVersion: 'ENSv1',
      includeExpired: true,
    })
  })

  it('confirms an unwrapped subname without reading the wrapper', async () => {
    expect((await submit('registry')).isOk()).toBe(true)
    expect(mocks.getWrapperData).not.toHaveBeenCalled()
  })

  it('reads the wrapper only for a wrapped subname', async () => {
    mocks.getV1NameState.mockReturnValue(parentHeld(true))
    mocks.getOwner.mockResolvedValue({
      owner: OTHER,
      ownershipLevel: 'nameWrapper',
    })
    mocks.getWrapperData.mockResolvedValue(wrapperData({ isEmancipated: true }))

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

  it('reads the parent once for a bulk delete, and every subname', async () => {
    const result = await prepareDeleteV1SubnamesSubmit({
      parentName: 'parent.eth',
      account: ACCOUNT,
      deletes: ['a', 'b', 'c'].map((label) => ({
        labelhash: labelhash(label),
        labelName: label,
        target: 'registry' as const,
      })),
    })

    expect(result.isOk()).toBe(true)
    expect(mocks.getV1NameState).toHaveBeenCalledOnce()
    expect(mocks.getOwner).toHaveBeenCalledTimes(3)
  })

  it('refuses an uncounted subname', async () => {
    mocks.getSubnamesCount.mockReturnValue(okAsync(null))

    expect((await submit('registry'))._unsafeUnwrapErr().cause).toEqual({
      kind: 'refused',
      reason: 'unknown',
    })
  })

  it('refuses an account that holds neither the parent nor the subname', async () => {
    mocks.getV1NameState.mockReturnValue(parentHeld(false, OTHER))

    expect((await submit('registry'))._unsafeUnwrapErr().cause).toEqual({
      kind: 'refused',
      reason: 'not-holder',
    })
  })

  // WEB-1909: the subname's own holder deletes it on its own node.
  it('confirms the holder of an unwrapped subname without the parent', async () => {
    mocks.getV1NameState.mockReturnValue(parentHeld(false, OTHER))
    mocks.getOwner.mockResolvedValue({
      owner: ACCOUNT,
      ownershipLevel: 'registry',
    })

    expect((await submit('registry-as-holder')).isOk()).toBe(true)
  })

  it('refuses the holder of a locked subname', async () => {
    mocks.getV1NameState.mockReturnValue(parentHeld(false, OTHER))
    mocks.getOwner.mockResolvedValue({
      owner: ACCOUNT,
      ownershipLevel: 'nameWrapper',
    })
    mocks.getWrapperData.mockResolvedValue(
      wrapperData({ isEmancipated: true, isLocked: true }),
    )

    expect(
      (await submit('wrapper-as-holder'))._unsafeUnwrapErr().cause,
    ).toEqual({ kind: 'refused', reason: 'locked' })
  })
})
