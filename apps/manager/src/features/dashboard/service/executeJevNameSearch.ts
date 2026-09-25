import type { SmartNameFilters } from '../smartNameSearch'
import {
  buildJevNameSearchRequest,
  JEV_NAME_SEARCH_POLICY_VERSION,
  JEV_NAME_SEARCH_QUESTION_SET_VERSION,
  type JevNameSearchRejectionReason,
  parseJevNameSearchResponseWithReason,
} from './jevNameSearch'

const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const DEFAULT_TIMEOUT_MS = 8000

type JevFetch = (input: string, init: RequestInit) => Promise<Response>

type JevUsage = {
  readonly inputTokens: number
  readonly outputTokens: number
}

export type JevNameSearchEvidence = {
  readonly requestedModel: string
  readonly questionSetVersion: string
  readonly policyVersion: string
  readonly returnedModel?: string
  readonly answers?: unknown
  readonly usage?: JevUsage
}

export type ExecuteJevNameSearchResult =
  | {
      readonly status: 'ok'
      readonly filters: SmartNameFilters
      readonly evidence: JevNameSearchEvidence
    }
  | {
      readonly status: 'unsupported'
      readonly reason: JevNameSearchRejectionReason
      readonly evidence: JevNameSearchEvidence
    }
  | {
      readonly status: 'unavailable'
      readonly reason:
        | 'http_error'
        | 'invalid_json'
        | 'request_error'
        | 'timeout'
      readonly httpStatus?: number
      readonly evidence: JevNameSearchEvidence
    }

export const validateNameSearchInput = (
  input: unknown,
): { readonly query: string } => {
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readUsage = (value: unknown): JevUsage | undefined => {
  if (!isRecord(value)) return undefined
  const inputTokens = value.input_tokens
  const outputTokens = value.output_tokens
  if (
    typeof inputTokens !== 'number' ||
    !Number.isFinite(inputTokens) ||
    inputTokens < 0 ||
    typeof outputTokens !== 'number' ||
    !Number.isFinite(outputTokens) ||
    outputTokens < 0
  ) {
    return undefined
  }
  return { inputTokens, outputTokens }
}

const readEvidence = (
  requestedModel: string,
  payload?: unknown,
): JevNameSearchEvidence => {
  const versions = {
    questionSetVersion: JEV_NAME_SEARCH_QUESTION_SET_VERSION,
    policyVersion: JEV_NAME_SEARCH_POLICY_VERSION,
  }
  if (!isRecord(payload)) return { requestedModel, ...versions }
  const usage = readUsage(payload.usage)
  return {
    requestedModel,
    ...versions,
    ...(typeof payload.model === 'string' && {
      returnedModel: payload.model,
    }),
    ...('answers' in payload && { answers: payload.answers }),
    ...(usage && { usage }),
  }
}

const isTimeoutError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'TimeoutError' || error.name === 'AbortError')

export const executeJevNameSearch = async ({
  input,
  apiKey,
  fetcher = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = new Date(),
}: {
  readonly input: unknown
  readonly apiKey: string
  readonly fetcher?: JevFetch
  readonly timeoutMs?: number
  readonly now?: Date
}): Promise<ExecuteJevNameSearchResult> => {
  const { query } = validateNameSearchInput(input)
  const request = buildJevNameSearchRequest(query)
  const emptyEvidence = readEvidence(request.model)

  try {
    const response = await fetcher(JEV_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      return {
        status: 'unavailable',
        reason: 'http_error',
        httpStatus: response.status,
        evidence: emptyEvidence,
      }
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return {
        status: 'unavailable',
        reason: 'invalid_json',
        evidence: emptyEvidence,
      }
    }

    const evidence = readEvidence(request.model, payload)
    const parsed = parseJevNameSearchResponseWithReason(payload, query, now)
    return parsed.status === 'ok'
      ? { status: 'ok', filters: parsed.filters, evidence }
      : { status: 'unsupported', reason: parsed.reason, evidence }
  } catch (error) {
    return {
      status: 'unavailable',
      reason: isTimeoutError(error) ? 'timeout' : 'request_error',
      evidence: emptyEvidence,
    }
  }
}
