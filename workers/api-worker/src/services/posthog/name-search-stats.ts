import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import { logger } from '#utils/logger.js'

class PostHogNameSearchStatsError extends TaggedError(
  'POSTHOG_NAME_SEARCH_STATS_ERROR',
)<{
  cause: unknown
}> {}

const normalizeCount = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value
  }

  if (
    typeof value === 'string' &&
    value.trim() !== '' &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0
  ) {
    return Number(value)
  }

  return null
}

const extractUniqueSearchCount = (payload: unknown): number => {
  const direct = normalizeCount(payload)
  if (direct !== null) return direct

  const queue: unknown[] = [payload]

  while (queue.length > 0) {
    const current = queue.shift()
    const normalized = normalizeCount(current)

    if (normalized !== null) {
      return normalized
    }

    if (Array.isArray(current)) {
      queue.push(...current)
      continue
    }

    if (current && typeof current === 'object') {
      const record = current as Record<string, unknown>
      const namedCount = normalizeCount(record.unique_searches_last_30d)

      if (namedCount !== null) {
        return namedCount
      }

      queue.push(...Object.values(record))
    }
  }

  return 0
}

const resolveEndpointUrl = ResultFn(async function* (env: CloudflareBindings) {
  const host = env.POSTHOG?.host?.replace(/\/+$/, '') ?? ''
  const endpoint = env.POSTHOG?.unique_searches_endpoint?.trim() ?? ''

  if (!host || !endpoint) {
    return new PostHogNameSearchStatsError({
      cause: new Error('PostHog bindings are incomplete'),
    }).toErr()
  }

  if (/^https?:\/\//.test(endpoint)) {
    return ok(endpoint)
  }

  return ok(
    endpoint.startsWith('/') ? `${host}${endpoint}` : `${host}/${endpoint}`,
  )
})

const fetchUniqueSearchesLast30d = ResultFn(async function* (
  env: CloudflareBindings,
  name: string,
) {
  const endpointUrl = yield* resolveEndpointUrl(env)

  const response = yield* fromPromise(
    fetch(endpointUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        variables: { name },
      }),
    }),
    (cause) => new PostHogNameSearchStatsError({ cause }),
  )

  if (!response.ok) {
    return new PostHogNameSearchStatsError({
      cause: new Error(`PostHog request failed with status ${response.status}`),
    }).toErr()
  }

  const payload = yield* fromPromise(
    response.json() as Promise<unknown>,
    (cause) => new PostHogNameSearchStatsError({ cause }),
  )

  return ok(extractUniqueSearchCount(payload))
})

export const getUniqueSearchesLast30dFromPostHog = ResultFn(async function* (
  env: CloudflareBindings,
  name: string,
) {
  const result = yield* fetchUniqueSearchesLast30d(env, name).orElse(
    (error) => {
      logger.error('Failed to fetch unique search count from PostHog', {
        error,
        name,
      })
      return ok(0)
    },
  )

  return ok(result)
})
