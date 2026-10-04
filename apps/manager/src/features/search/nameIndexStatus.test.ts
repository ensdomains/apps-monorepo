import { BignameError } from '@ens-apps/bigname'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getName: vi.fn() }))

vi.mock('@/lib/bigname', () => ({ bigname: { getName: mocks.getName } }))

import { getNameIndexStatus } from './nameIndexStatus'

const detail = (data: Record<string, unknown>) => ({
  data: { name: 'sub.alice.eth', ...data },
  meta: {},
})

describe('getNameIndexStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('treats a held name as known', async () => {
    mocks.getName.mockResolvedValue(
      detail({ status: 'ok', registration_status: 'active' }),
    )
    await expect(getNameIndexStatus('sub.alice.eth')).resolves.toBe('held')
  })

  it('treats an unsupported name as known', async () => {
    mocks.getName.mockResolvedValue(
      detail({ status: 'unsupported', unsupported_reason: 'x' }),
    )
    await expect(getNameIndexStatus('sub.alice.eth')).resolves.toBe('held')
  })

  it('does not treat a released name as held', async () => {
    mocks.getName.mockResolvedValue(
      detail({ status: 'ok', registration_status: 'released' }),
    )
    await expect(getNameIndexStatus('sub.alice.eth')).resolves.toBe('released')
  })

  it('treats a 404 as not indexed rather than an error', async () => {
    mocks.getName.mockResolvedValue(null)
    await expect(getNameIndexStatus('sub.alice.eth')).resolves.toBe(
      'not_indexed',
    )
  })

  it('treats a name bigname rejects as not indexed', async () => {
    mocks.getName.mockRejectedValue(
      new BignameError({ status: 400, code: 'invalid_input', message: 'bad' }),
    )
    await expect(getNameIndexStatus('bad..eth')).resolves.toBe('not_indexed')
  })

  it('surfaces other failures', async () => {
    mocks.getName.mockRejectedValue(
      new BignameError({ status: 503, code: 'overloaded', message: 'busy' }),
    )
    await expect(getNameIndexStatus('sub.alice.eth')).rejects.toThrow('busy')
  })
})
