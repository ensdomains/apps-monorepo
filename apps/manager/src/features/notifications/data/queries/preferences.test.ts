import type { UserNotificationSettings } from '@ens-apps/shared-schema/notifications'
import {
  type MutationFunctionContext,
  QueryClient,
} from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/backend-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/backend-client')>()),
  backendClient: {
    notifications: {
      preferences: { $get: vi.fn(), $patch: vi.fn() },
      channels: { $get: vi.fn() },
    },
  },
}))

import { backendAuthStore, backendClient } from '@/utils/backend-client'
import { getPreferenceSession } from '../../services/preferenceSession'
import {
  getPreferenceChanges,
  getPreferenceProposalValues,
} from '../../settings/preferenceProposal'
import {
  getPreferenceChannelsQueryOptions,
  getPreferencesQueryOptions,
  updatePreferenceMutationOptions,
} from './preferences'

const loginA = {
  address: '0x0000000000000000000000000000000000000001',
  authKey: 'synthetic-a',
}
const loginB = {
  address: '0x0000000000000000000000000000000000000002',
  authKey: 'synthetic-b',
}
const settingsA: UserNotificationSettings = {
  ownedNameExpiry: true,
  ensLabsUpdates: true,
  favouritedNameExpiry: false,
}
const settingsB: UserNotificationSettings = {
  ownedNameExpiry: false,
  ensLabsUpdates: false,
  favouritedNameExpiry: false,
}
const get = vi.mocked(backendClient.notifications.preferences.$get)
const patch = vi.mocked(backendClient.notifications.preferences.$patch)
const channelGet = vi.mocked(backendClient.notifications.channels.$get)
const response = (
  settings = settingsB,
  verifiedChannels: string[] = ['email'],
) => ({ ok: true, json: async () => ({ settings, verifiedChannels }) })
const run = (
  session = getPreferenceSession(),
  baseline = settingsB,
  values = { ...settingsB, favouritedNameExpiry: true },
) => {
  const mutation = updatePreferenceMutationOptions.mutationFn
  if (!mutation) throw new Error('Missing preference mutation')
  return mutation({ session, baseline, values }, {} as MutationFunctionContext)
}

describe('notification preference session and partial saves', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    backendAuthStore.trigger.signIn(loginA)
    get.mockResolvedValue(response() as never)
    patch.mockResolvedValue(
      response({ ...settingsB, favouritedNameExpiry: true }) as never,
    )
  })
  afterEach(() => backendAuthStore.trigger.signOut())

  it('isolates A and B preference and verified-channel caches without credentials in keys', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const a = getPreferenceSession()
    get.mockResolvedValueOnce(response(settingsA) as never)
    await client.fetchQuery(getPreferencesQueryOptions(a))
    backendAuthStore.trigger.signIn(loginB)
    const b = getPreferenceSession()
    expect(getPreferencesQueryOptions(a).queryKey).not.toEqual(
      getPreferencesQueryOptions(b).queryKey,
    )
    expect(getPreferenceChannelsQueryOptions(a).queryKey).not.toEqual(
      getPreferenceChannelsQueryOptions(b).queryKey,
    )
    expect(
      client.getQueryData(getPreferencesQueryOptions(b).queryKey),
    ).toBeUndefined()
    expect(
      await client.fetchQuery(getPreferencesQueryOptions(b)),
    ).toMatchObject({ settings: settingsB })
    expect(
      JSON.stringify(getPreferencesQueryOptions(a).queryKey),
    ).not.toContain(loginA.authKey)
    client.clear()
  })

  it('applies only the requested switch to fresh B values and discards A proposals', () => {
    const a = getPreferenceSession()
    backendAuthStore.trigger.signIn(loginB)
    const b = getPreferenceSession()
    const proposal = { key: 'favouritedNameExpiry', enabled: true } as const
    expect(
      getPreferenceProposalValues(settingsB, proposal, a.id, b.id),
    ).toEqual(settingsB)
    expect(
      getPreferenceProposalValues(settingsB, proposal, b.id, b.id),
    ).toEqual({ ...settingsB, favouritedNameExpiry: true })
  })

  it('PATCHes changed keys only, preserving unrelated fresh server settings', async () => {
    get.mockResolvedValueOnce(response(settingsA) as never)
    await run()
    expect(patch).toHaveBeenCalledExactlyOnceWith({
      json: { favouritedNameExpiry: true },
    })
  })

  it('retains explicit false and excludes unchanged values', () => {
    expect(
      getPreferenceChanges(settingsA, { ...settingsA, ownedNameExpiry: false }),
    ).toEqual({ ownedNameExpiry: false })
    expect(getPreferenceChanges(settingsA, settingsA)).toEqual({})
  })

  it('does not write when the user changed nothing, preserving newer server state', async () => {
    get.mockResolvedValueOnce(response(settingsA) as never)
    await expect(
      run(getPreferenceSession(), settingsB, settingsB),
    ).resolves.toMatchObject({ settings: settingsA })
    expect(patch).not.toHaveBeenCalled()
  })

  it('does not write if the requested value already matches the latest server state', async () => {
    get.mockResolvedValueOnce(
      response({ ...settingsA, favouritedNameExpiry: true }) as never,
    )
    await run()
    expect(patch).not.toHaveBeenCalled()
  })

  it.each([
    'switch wallet',
    'replace token',
    'sign out and restore',
  ])('rejects a pending old draft after %s', async (change) => {
    let complete: (value: Awaited<ReturnType<typeof get>>) => void = () =>
      undefined
    get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const pending = run()
    const rejected = expect(pending).rejects.toMatchObject({
      _tag: 'NotificationSessionChangedError',
    })
    if (change === 'switch wallet') backendAuthStore.trigger.signIn(loginB)
    else if (change === 'replace token')
      backendAuthStore.trigger.signIn({ ...loginA, authKey: 'synthetic-new' })
    else {
      backendAuthStore.trigger.signOut()
      backendAuthStore.trigger.signIn(loginA)
    }
    complete(response() as never)
    await rejected
    expect(patch).not.toHaveBeenCalled()
  })

  it('rejects a stale captured submit session before any read/write', async () => {
    const a = getPreferenceSession()
    backendAuthStore.trigger.signIn(loginB)
    await expect(run(a)).rejects.toMatchObject({
      _tag: 'NotificationSessionChangedError',
    })
    expect(get).not.toHaveBeenCalled()
    expect(patch).not.toHaveBeenCalled()
  })

  it('rechecks verified contacts before saving, including contact removal after review', async () => {
    get.mockResolvedValueOnce(response(settingsB, []) as never)
    await expect(run()).rejects.toThrow('Verify at least one contact method')
    expect(patch).not.toHaveBeenCalled()
  })

  it('rejects an old channel response instead of using it to enable another session', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    let complete: (value: Awaited<ReturnType<typeof channelGet>>) => void =
      () => undefined
    channelGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const pending = client.fetchQuery(
      getPreferenceChannelsQueryOptions(getPreferenceSession()),
    )
    const rejected = expect(pending).rejects.toMatchObject({
      _tag: 'NotificationSessionChangedError',
    })
    backendAuthStore.trigger.signIn(loginB)
    complete({ ok: true, json: async () => [{ status: 'verified' }] } as never)
    await rejected
    client.clear()
  })
})
