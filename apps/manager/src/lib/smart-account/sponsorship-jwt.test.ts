/**
 * Tests for the manager-side Rhinestone JWT auth callbacks.
 *
 * `mintToken` is the client code the SDK invokes per intent: it resolves the
 * sponsorship base URL, conditionally attaches the backend-auth bearer, POSTs
 * to the api-worker, and throws on a non-2xx or a token-less 200. backend-client
 * (which eagerly evaluates posthog) is imported lazily inside `mintToken`, so we
 * mock it here; `fetch` is stubbed globally.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetBackendApiBaseUrl, authState } = vi.hoisted(() => ({
  mockGetBackendApiBaseUrl: vi.fn<() => string>(),
  authState: { authKey: undefined as string | undefined },
}))

vi.mock('@/utils/backend-client', () => ({
  getBackendApiBaseUrl: mockGetBackendApiBaseUrl,
  backendAuthStore: {
    get: () => ({ context: { authKey: authState.authKey } }),
  },
}))

import { createJwtAuthCallbacks } from './sponsorship-jwt'

const fetchMock = vi.fn()

const okResponse = (token: unknown) => ({
  ok: true,
  status: 200,
  json: async () => (token === undefined ? {} : { token }),
})

describe('createJwtAuthCallbacks / mintToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authKey = undefined
    mockGetBackendApiBaseUrl.mockReturnValue('https://backend.example')
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('VITE_SPONSORSHIP_API_URL', '/api')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('mints an access token and returns it', async () => {
    fetchMock.mockResolvedValue(okResponse('access-tok'))

    await expect(createJwtAuthCallbacks().accessToken()).resolves.toBe(
      'access-tok',
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sponsorship/access-token',
      expect.objectContaining({ method: 'POST' }),
    )
    // access-token request carries no body
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty('body')
  })

  it('strips a trailing slash from the base URL', async () => {
    vi.stubEnv('VITE_SPONSORSHIP_API_URL', 'https://api.example/')
    fetchMock.mockResolvedValue(okResponse('t'))

    await createJwtAuthCallbacks().accessToken()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/sponsorship/access-token',
      expect.anything(),
    )
  })

  it('falls back to getBackendApiBaseUrl when VITE_SPONSORSHIP_API_URL is unset', async () => {
    vi.stubEnv('VITE_SPONSORSHIP_API_URL', undefined as unknown as string)
    fetchMock.mockResolvedValue(okResponse('t'))

    await createJwtAuthCallbacks().accessToken()

    expect(mockGetBackendApiBaseUrl).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.example/sponsorship/access-token',
      expect.anything(),
    )
  })

  it('attaches the bearer header when an authKey is present', async () => {
    authState.authKey = 'session-jwt'
    fetchMock.mockResolvedValue(okResponse('t'))

    await createJwtAuthCallbacks().accessToken()

    const init = fetchMock.mock.calls[0]?.[1] as {
      headers: Record<string, string>
    }
    expect(init.headers).toMatchObject({ authorization: 'Bearer session-jwt' })
  })

  it('omits the bearer header when no authKey is present', async () => {
    authState.authKey = undefined
    fetchMock.mockResolvedValue(okResponse('t'))

    await createJwtAuthCallbacks().accessToken()

    const init = fetchMock.mock.calls[0]?.[1] as {
      headers: Record<string, string>
    }
    expect(init.headers).not.toHaveProperty('authorization')
  })

  it('sends { intentInput } as the body for extension tokens', async () => {
    fetchMock.mockResolvedValue(okResponse('ext-tok'))
    const intentInput = { destinationChainId: 11155111 }

    await expect(
      createJwtAuthCallbacks().getIntentExtensionToken(intentInput),
    ).resolves.toBe('ext-tok')

    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    expect(url).toBe('/api/sponsorship/extension-token')
    expect(JSON.parse(init.body)).toEqual({ intentInput })
  })

  it('throws with the status when the response is not ok', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    })

    await expect(createJwtAuthCallbacks().accessToken()).rejects.toThrow(
      'sponsorship/access-token failed: 403',
    )
  })

  it('throws when a 200 response carries no token', async () => {
    fetchMock.mockResolvedValue(okResponse(undefined))

    await expect(createJwtAuthCallbacks().accessToken()).rejects.toThrow(
      'returned no token',
    )
  })
})
