import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { extractEnsNames, redactAiQuery } from '@/features/ai/intent'
import {
  interpretJevRequest,
  type JevEnvironment,
  validateJevInput,
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
    const { env } = await import('cloudflare:workers')
    return interpretJevRequest({
      entryPoint: 'dashboard',
      data,
      requestUrl: getRequest().url,
      environment: env as JevEnvironment,
      isSupportedQuery: (query) =>
        extractEnsNames(query).length === 0 &&
        !/\b0x[a-f\d]{40}\b/i.test(query),
      buildRequest: (query) => buildJevNameSearchRequest(redactAiQuery(query)),
      parseResponse: (body, query) => {
        const filters = parseJevNameSearchResponse(body, query)
        return filters ? { status: 'ok', filters } : null
      },
    })
  })
