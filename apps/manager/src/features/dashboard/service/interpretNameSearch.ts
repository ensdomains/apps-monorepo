import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { extractEnsNames, redactAiQuery } from '@/features/ai/intent'
import {
  callJev,
  isValidJevQuery,
  type JevEnvironment,
  logJevOutcome,
  validateJevInput,
  verifyJevAccess,
} from '@/features/ai/jevBoundary'
import type { SmartNameFilters } from '../smartNameSearch'
import {
  buildJevNameSearchRequest,
  parseJevNameSearchResponse,
} from './jevNameSearch'

export type InterpretNameSearchResult =
  | { readonly status: 'ok'; readonly filters: SmartNameFilters }
  | {
      readonly status:
        | 'unsupported'
        | 'unavailable'
        | 'unauthorized'
        | 'rate_limited'
    }

export const interpretNameSearch = createServerFn({ method: 'POST' })
  .inputValidator(validateJevInput)
  .handler(async ({ data }): Promise<InterpretNameSearchResult> => {
    const startedAt = Date.now()
    const finish = (result: InterpretNameSearchResult) => {
      logJevOutcome('dashboard', result.status, startedAt)
      return result
    }
    if (!isValidJevQuery(data.query)) return finish({ status: 'unsupported' })
    if (
      extractEnsNames(data.query).length > 0 ||
      /\b0x[a-f\d]{40}\b/i.test(data.query)
    )
      return finish({ status: 'unsupported' })
    const { env } = await import('cloudflare:workers')
    const environment = env as JevEnvironment
    const access = await verifyJevAccess({
      authToken: data.authToken,
      requestUrl: getRequest().url,
      environment,
    })
    if (access.status !== 'ok') return finish({ status: access.status })
    const response = await callJev(
      buildJevNameSearchRequest(redactAiQuery(data.query)),
      environment,
    )
    if (response.status !== 'ok') return finish({ status: response.status })
    const filters = parseJevNameSearchResponse(response.body, data.query)
    return finish(
      filters ? { status: 'ok', filters } : { status: 'unsupported' },
    )
  })
