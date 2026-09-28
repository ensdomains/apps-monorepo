import type { UserNotificationSettings } from '@ens-apps/shared-schema/notifications'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { createElement, type PropsWithChildren } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
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
import { getPreferencesQueryOptions } from '../data/queries/preferences'
import { getPreferenceSession } from '../services/preferenceSession'
import {
  type UseNotificationPreferencesFormOptions,
  useNotificationPreferencesForm,
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
const response = (settings = settingsA) => ({
  ok: true,
  json: async () => ({ settings, verifiedChannels: ['email'] }),
})

describe('notification preference form session lifecycle', () => {
  let client: QueryClient
  const mount = (options: UseNotificationPreferencesFormOptions = {}) =>
    renderHook(() => useNotificationPreferencesForm(options), {
      wrapper: ({ children }: PropsWithChildren) =>
        createElement(
          I18nProvider,
          { i18n },
          createElement(QueryClientProvider, { client }, children),
        ),
    })

  beforeEach(() => {
    vi.clearAllMocks()
    i18n.loadAndActivate({ locale: 'en', messages: {} })
    backendAuthStore.trigger.signIn(loginA)
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    get.mockResolvedValue(response() as never)
    channelGet.mockResolvedValue({
      ok: true,
      json: async () => [{ status: 'verified', type: 'email' }],
    } as never)
    patch.mockResolvedValue(
      response({ ...settingsA, favouritedNameExpiry: true }) as never,
    )
  })
  afterEach(() => {
    cleanup()
    client.clear()
    backendAuthStore.trigger.signOut()
  })

  it('discards A’s proposal after a wallet switch and initializes only from B’s fresh settings', async () => {
    const a = getPreferenceSession()
    const { result } = mount({
      proposedPreference: { key: 'favouritedNameExpiry', enabled: true },
      proposalSessionId: a.id,
    })
    await waitFor(() => expect(result.current.hasVerifiedChannels).toBe(true))
    expect(result.current.form.state.values).toEqual({
      ...settingsA,
      favouritedNameExpiry: true,
    })
    let finish: (value: Awaited<ReturnType<typeof get>>) => void = () =>
      undefined
    get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    act(() => backendAuthStore.trigger.signIn(loginB))
    expect(result.current.isReady).toBe(false)
    expect(result.current.hasVerifiedChannels).toBe(false)
    await act(async () => finish(response(settingsB) as never))
    await waitFor(() => expect(result.current.isReady).toBe(true))
    expect(result.current.staleProposal).toBe(true)
    expect(result.current.form.state.values).toEqual(settingsB)
    expect(patch).not.toHaveBeenCalled()
  })

  it('waits for a fresh mount read before applying a proposal to cached values', async () => {
    const session = getPreferenceSession()
    client.setQueryData(getPreferencesQueryOptions(session).queryKey, {
      settings: settingsA,
      verifiedChannels: ['email'],
    })
    let finish: (value: Awaited<ReturnType<typeof get>>) => void = () =>
      undefined
    get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const { result } = mount({
      proposedPreference: { key: 'favouritedNameExpiry', enabled: true },
      proposalSessionId: session.id,
    })
    expect(result.current.isReady).toBe(false)
    await act(async () => finish(response(settingsB) as never))
    await waitFor(() => expect(result.current.isReady).toBe(true))
    expect(result.current.form.state.values).toEqual({
      ...settingsB,
      favouritedNameExpiry: true,
    })
  })

  it('preserves an edited draft through refetch and saves only its changed field', async () => {
    const { result } = mount()
    await waitFor(() => expect(result.current.hasVerifiedChannels).toBe(true))
    act(() => result.current.form.setFieldValue('favouritedNameExpiry', true))
    get.mockResolvedValue(response(settingsB) as never)
    await act(async () => {
      await result.current.preferences.refetch()
    })
    expect(result.current.form.state.values).toEqual({
      ...settingsA,
      favouritedNameExpiry: true,
    })
    await act(async () => {
      await result.current.form.handleSubmit()
    })
    expect(patch).toHaveBeenCalledExactlyOnceWith({
      json: { favouritedNameExpiry: true },
    })
  })

  it('captures the original submit session before asynchronous form validation', async () => {
    const onPersistSuccess = vi.fn()
    const { result } = mount({ onPersistSuccess })
    await waitFor(() => expect(result.current.hasVerifiedChannels).toBe(true))
    act(() => result.current.form.setFieldValue('favouritedNameExpiry', true))
    await act(async () => {
      const pending = result.current.form.handleSubmit()
      backendAuthStore.trigger.signIn(loginB)
      await pending
    })
    expect(patch).not.toHaveBeenCalled()
    expect(onPersistSuccess).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      'Your sign-in changed. Review notification settings again.',
    )
  })

  it('allows registration to continue without a PATCH when settings are unchanged', async () => {
    const onPersistSuccess = vi.fn()
    const { result } = mount({
      nameExpiryDefaultWhenUnset: true,
      onPersistSuccess,
    })
    await waitFor(() => expect(result.current.hasVerifiedChannels).toBe(true))
    await act(async () => {
      await result.current.form.handleSubmit()
    })
    expect(patch).not.toHaveBeenCalled()
    expect(onPersistSuccess).toHaveBeenCalledOnce()
  })
})
