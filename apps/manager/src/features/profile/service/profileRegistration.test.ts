import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: {},
  getRegistrationDate: vi.fn(),
  getNameDetail: vi.fn(),
  getOwner: vi.fn(),
}))

vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getRegistrationDate: mocks.getRegistrationDate,
}))

vi.mock('@/features/shared/service/nameDetail', () => ({
  getNameDetail: mocks.getNameDetail,
}))

vi.mock('./profileOwner', () => ({ getOwner: mocks.getOwner }))

vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return {
    safeGetClient: () => ok(mocks.client),
  }
})

import {
  getRegistration,
  profileRegistrationQuery,
} from './profileRegistration'

const registeredAt = (seconds: number) =>
  okAsync({ registeredAt: new Date(seconds * 1000) })

describe('profileRegistrationQuery', () => {
  it('includes protocol in the query key', () => {
    expect(profileRegistrationQuery('foo.eth', 'v1').queryKey).toEqual([
      {
        $scope: 'profile',
        $action: 'registration',
        name: 'foo.eth',
        protocol: 'v1',
      },
    ])
  })
})

describe('getRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getNameDetail.mockReturnValue(okAsync(null))
  })

  it.each([
    'v1',
    'v2',
  ] as const)('reads a %s registration date from the index', async (protocol) => {
    mocks.getNameDetail.mockReturnValue(registeredAt(1_789_640_616))

    const result = await getRegistration('rabbit.eth', protocol)

    expect(result._unsafeUnwrap()).toEqual({ registrationDate: 1_789_640_616 })
    expect(mocks.getNameDetail).toHaveBeenCalledWith('rabbit.eth')
    expect(mocks.getRegistrationDate).not.toHaveBeenCalled()
  })

  it('falls back on chain for a V2 name the index has not seen yet', async () => {
    mocks.getRegistrationDate.mockResolvedValue(1_800_000_000n)

    const result = await getRegistration('figma.eth', 'v2')

    expect(result._unsafeUnwrap()).toEqual({ registrationDate: 1_800_000_000 })
  })

  it('falls back on chain when the index cannot be read', async () => {
    mocks.getNameDetail.mockReturnValue(errAsync(new Error('bigname down')))
    mocks.getRegistrationDate.mockResolvedValue(1_800_000_000n)

    const result = await getRegistration('figma.eth', 'v2')

    expect(result._unsafeUnwrap()).toEqual({ registrationDate: 1_800_000_000 })
  })

  it('has no date for a V1 name the index has not seen', async () => {
    const result = await getRegistration('fgeorgescu.eth', 'v1')

    expect(result._unsafeUnwrap()).toEqual({ registrationDate: null })
    expect(mocks.getRegistrationDate).not.toHaveBeenCalled()
  })

  it('works out the protocol from the owner only when the index has no date', async () => {
    mocks.getOwner.mockReturnValue(okAsync({ protocol: 'v1' }))

    const result = await getRegistration('fgeorgescu.eth')

    expect(result._unsafeUnwrap()).toEqual({ registrationDate: null })
    expect(mocks.getOwner).toHaveBeenCalledWith({ name: 'fgeorgescu.eth' })
  })

  it('reads a subname registration date from the index', async () => {
    mocks.getNameDetail.mockReturnValue(registeredAt(1_790_000_000))

    const result = await getRegistration('mini.shiba.eth')

    expect(result._unsafeUnwrap()).toEqual({ registrationDate: 1_790_000_000 })
    expect(mocks.getNameDetail).toHaveBeenCalledWith('mini.shiba.eth')
    expect(mocks.getRegistrationDate).not.toHaveBeenCalled()
  })
})
