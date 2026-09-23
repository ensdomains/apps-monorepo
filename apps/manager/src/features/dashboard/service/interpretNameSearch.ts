import { createServerFn } from '@tanstack/react-start'
import type { SmartNameFilters } from '../smartNameSearch'
import {
  buildJevNameSearchRequest,
  parseJevNameSearchResponse,
} from './jevNameSearch'

export type InterpretNameSearchResult =
  | { readonly status: 'ok'; readonly filters: SmartNameFilters }
  | { readonly status: 'unsupported' }
  | { readonly status: 'unavailable' }

const validateInput = (input: unknown): { query: string } => {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('query' in input) ||
    typeof input.query !== 'string'
  ) {
    throw new Error('Invalid search query')
  }
  const query = input.query.trim()
  if (query.length < 2 || query.length > 160) {
    throw new Error('Invalid search query length')
  }
  return { query }
}

export const interpretNameSearch = createServerFn({ method: 'POST' })
  .inputValidator(validateInput)
  .handler(async ({ data }): Promise<InterpretNameSearchResult> => {
    if (!import.meta.env.DEV) return { status: 'unavailable' }

    const { env } = await import('cloudflare:workers')
    const key = (env as Cloudflare.Env & { readonly TYPESAFE_API_KEY?: string })
      .TYPESAFE_API_KEY
    if (!key) return { status: 'unavailable' }

    try {
      const response = await fetch('https://api.typesafe.ai/v1/systemone', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildJevNameSearchRequest(data.query)),
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) return { status: 'unavailable' }

      const filters = parseJevNameSearchResponse(
        await response.json(),
        data.query,
      )
      return filters ? { status: 'ok', filters } : { status: 'unsupported' }
    } catch {
      return { status: 'unavailable' }
    }
  })
