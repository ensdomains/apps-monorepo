import { createServerFn } from '@tanstack/react-start'
import type { SmartNameFilters } from '../smartNameSearch'
import {
  executeJevNameSearch,
  validateNameSearchInput,
} from './executeJevNameSearch'

export type InterpretNameSearchResult =
  | { readonly status: 'ok'; readonly filters: SmartNameFilters }
  | { readonly status: 'unsupported' }
  | { readonly status: 'unavailable' }

const readJevApiKey = (value: unknown): string | undefined => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('JEV_API_KEY' in value) ||
    typeof value.JEV_API_KEY !== 'string'
  ) {
    return undefined
  }
  return value.JEV_API_KEY || undefined
}

export const interpretNameSearch = createServerFn({ method: 'POST' })
  .inputValidator(validateNameSearchInput)
  .handler(async ({ data }): Promise<InterpretNameSearchResult> => {
    if (!import.meta.env.DEV) return { status: 'unavailable' }

    try {
      const { env } = await import('cloudflare:workers')
      const apiKey = readJevApiKey(env)
      if (!apiKey) return { status: 'unavailable' }

      const result = await executeJevNameSearch({ input: data, apiKey })
      if (result.status === 'ok') {
        return { status: 'ok', filters: result.filters }
      }
      return { status: result.status }
    } catch {
      return { status: 'unavailable' }
    }
  })
