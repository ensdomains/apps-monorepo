import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: {},
  getName: vi.fn(),
  getRegistrationDate: vi.fn(),
}))

vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getRegistrationDate: mocks.getRegistrationDate,
}))

vi.mock('@/lib/bigname', () => ({ bigname: { getName: mocks.getName } }))

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

const detail = (data: Record<string, unknown>) => ({
  data: { status: 'ok', ...data },
  meta: {},
})

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
    mocks.getName.mockResolvedValue(null)
  })

  it('reads a V2 registration date from bigname', async () => {
    mocks.getName.mockResolvedValue(detail({ registered_at: '1789640616' }))

    const result = await getRegistration('rabbit.eth', 'v2')

    expect(result._unsafeUnwrap()).toEqual({ registrationDate: 1_789_640_616 })
    expect(mocks.getName).toHaveBeenCalledWith('rabbit.eth')
    expect(mocks.getRegistrationDate).not.toHaveBeenCalled()
  })

  it('reads a V1 registration date from bigname, with no block lookup', async () => {
    mocks.getName.mockResolvedValue(
      detail({ authority: 'ens_v1', registered_at: '1800000000' }),
    )

    const result = await getRegistration('fgeorgescu.eth', 'v1')

    expect(result._unsafeUnwrap()).toEqual({
      registrationDate: 1_800_000_000,
    })
    expect(mocks.getRegistrationDate).not.toHaveBeenCalled()
  })

  it('answers no date for a V1 name bigname has no date for', async () => {
    const result = await getRegistration('fgeorgescu.eth', 'v1')

    expect(result._unsafeUnwrap()).toEqual({ registrationDate: null })
    expect(mocks.getRegistrationDate).not.toHaveBeenCalled()
  })

  it('falls back on chain for a V2 name bigname has not indexed (404)', async () => {
    mocks.getRegistrationDate.mockResolvedValue(1_800_000_000n)

    const result = await getRegistration('figma.eth', 'v2')

    expect(result._unsafeUnwrap()).toEqual({ registrationDate: 1_800_000_000 })
  })

  it('falls back on chain when bigname fails', async () => {
    mocks.getName.mockRejectedValue(new Error('bigname down'))
    mocks.getRegistrationDate.mockResolvedValue(1_800_000_000n)

    const result = await getRegistration('figma.eth', 'v2')

    expect(result._unsafeUnwrap()).toEqual({ registrationDate: 1_800_000_000 })
  })

  it('falls back on chain for an unsupported name', async () => {
    mocks.getName.mockResolvedValue(
      detail({ status: 'unsupported', unsupported_reason: 'x' }),
    )
    mocks.getRegistrationDate.mockResolvedValue(1_800_000_000n)

    const result = await getRegistration('figma.eth', 'v2')

    expect(result._unsafeUnwrap()).toEqual({ registrationDate: 1_800_000_000 })
  })

  it('reads a subname registration date from bigname', async () => {
    mocks.getName.mockResolvedValue(detail({ registered_at: '1790000000' }))

    const result = await getRegistration('mini.shiba.eth')

    expect(result._unsafeUnwrap()).toEqual({ registrationDate: 1_790_000_000 })
    expect(mocks.getName).toHaveBeenCalledWith('mini.shiba.eth')
    expect(mocks.getRegistrationDate).not.toHaveBeenCalled()
  })
})
