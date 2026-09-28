import { isAddress } from 'viem'

export type JevFailureStatus = 'unauthorized' | 'rate_limited' | 'unavailable'

export type JevModelResponse =
  | { readonly status: 'ok'; readonly body: unknown }
  | { readonly status: 'unavailable' }

export type JevEnvironment = Cloudflare.Env & {
  readonly TYPESAFE_API_KEY?: string
  readonly JEV_RATE_LIMIT?: RateLimit
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const validateJevInput = (
  input: unknown,
): { query: string; authToken: string } => {
  if (!isRecord(input)) return { query: '', authToken: '' }
  return {
    query: typeof input.query === 'string' ? input.query.trim() : '',
    authToken: typeof input.authToken === 'string' ? input.authToken : '',
  }
}

export const isValidJevQuery = (query: string): boolean =>
  query.length >= 2 && query.length <= 160

const authMeUrl = (requestUrl: string): URL => {
  const configured = import.meta.env.VITE_API_URL ?? '/api'
  const base = new URL(
    configured.endsWith('/') ? configured : `${configured}/`,
    requestUrl,
  )
  return new URL('auth/me', base)
}

export const verifyJevAccess = async ({
  authToken,
  requestUrl,
  environment,
  fetcher = fetch,
}: {
  authToken: string
  requestUrl: string
  environment: JevEnvironment
  fetcher?: typeof fetch
}): Promise<
  { status: 'ok'; address: string } | { status: JevFailureStatus }
> => {
  if (authToken.length < 8 || authToken.length > 4096) {
    return { status: 'unauthorized' }
  }

  try {
    const target = authMeUrl(requestUrl)
    const response = await fetcher(target.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${authToken}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    })
    if (response.status === 401 || response.status === 403) {
      return { status: 'unauthorized' }
    }
    if (!response.ok) return { status: 'unavailable' }
    const body: unknown = await response.json()
    if (
      !isRecord(body) ||
      typeof body.address !== 'string' ||
      !isAddress(body.address)
    ) {
      return { status: 'unavailable' }
    }

    const limiter = environment.JEV_RATE_LIMIT
    if (!limiter) return { status: 'unavailable' }
    const { success } = await limiter.limit({ key: body.address.toLowerCase() })
    if (!success) return { status: 'rate_limited' }
    return { status: 'ok', address: body.address.toLowerCase() }
  } catch {
    return { status: 'unavailable' }
  }
}

export const callJev = async (
  request: unknown,
  environment: JevEnvironment,
  fetcher: typeof fetch = fetch,
): Promise<JevModelResponse> => {
  const key = environment.TYPESAFE_API_KEY?.trim()
  if (!key) return { status: 'unavailable' }

  try {
    const response = await fetcher('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return { status: 'unavailable' }
    return { status: 'ok', body: await response.json() }
  } catch {
    return { status: 'unavailable' }
  }
}

export const logJevOutcome = (
  entryPoint: 'dashboard' | 'ai',
  status: 'ok' | 'needs_confirmation' | 'unsupported' | JevFailureStatus,
  startedAt: number,
  intent?: string,
): void => {
  console.info('jev_interpret', {
    entryPoint,
    status,
    ...(intent && { intent }),
    latencyMs: Date.now() - startedAt,
  })
}

type JevInterpretStatus =
  | 'ok'
  | 'needs_confirmation'
  | 'unsupported'
  | JevFailureStatus
type JevInterpretFailure = {
  readonly status: Exclude<JevInterpretStatus, 'ok' | 'needs_confirmation'>
}

// Both launchers use this boundary so authorization and rate limiting always
// happen before a provider request, regardless of which UI submitted it.
export const interpretJevRequest = async <
  TResult extends { readonly status: JevInterpretStatus },
>({
  entryPoint,
  data,
  requestUrl,
  environment,
  buildRequest,
  parseResponse,
  isSupportedQuery = () => true,
  getIntent,
  fetcher = fetch,
}: {
  readonly entryPoint: 'dashboard' | 'ai'
  readonly data: ReturnType<typeof validateJevInput>
  readonly requestUrl: string
  readonly environment: JevEnvironment
  readonly buildRequest: (query: string) => unknown
  readonly parseResponse: (
    body: unknown,
    query: string,
    requestFollowup: (request: unknown) => Promise<JevModelResponse>,
  ) => TResult | null | Promise<TResult | null>
  readonly isSupportedQuery?: (query: string) => boolean
  readonly getIntent?: (result: TResult) => string | undefined
  readonly fetcher?: typeof fetch
}): Promise<TResult | JevInterpretFailure> => {
  const startedAt = Date.now()
  const finish = (result: TResult | JevInterpretFailure, intent?: string) => {
    logJevOutcome(
      entryPoint,
      result.status,
      startedAt,
      result.status === 'ok' || result.status === 'needs_confirmation'
        ? intent
        : undefined,
    )
    return result
  }
  if (!isValidJevQuery(data.query) || !isSupportedQuery(data.query)) {
    return finish({ status: 'unsupported' })
  }

  const access = await verifyJevAccess({
    authToken: data.authToken,
    requestUrl,
    environment,
    fetcher,
  })
  if (access.status !== 'ok') return finish({ status: access.status })

  const response = await callJev(buildRequest(data.query), environment, fetcher)
  if (response.status !== 'ok') return finish({ status: response.status })
  let followupRequested = false
  const requestFollowup = (request: unknown): Promise<JevModelResponse> => {
    if (followupRequested) return Promise.resolve({ status: 'unavailable' })
    followupRequested = true
    return callJev(request, environment, fetcher)
  }
  const result = await parseResponse(response.body, data.query, requestFollowup)
  return result
    ? finish(result, getIntent?.(result))
    : finish({ status: 'unsupported' })
}
