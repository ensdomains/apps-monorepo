import {
  type AiIntent,
  type AiInterpretResult,
  parseUncertainJevAiResponse,
} from './intent'

/** Must pass candidate verification before entering the public interpretation flow. */
export type UncertainAiCandidate = {
  readonly interpretation: Extract<AiInterpretResult, { status: 'ok' }>
  readonly uncertainty: {
    readonly kind: 'main_intent'
    readonly choice: AiIntent
    readonly confidence: number
  }
}

/** Recover only the first-intent confidence gate; all other parser checks remain. */
export const buildUncertainAiCandidate = (
  response: unknown,
  query: string,
): UncertainAiCandidate | null => {
  const parsed = parseUncertainJevAiResponse(response, query)
  return parsed
    ? {
        interpretation: parsed.interpretation,
        uncertainty: {
          kind: 'main_intent',
          choice: parsed.choice,
          confidence: parsed.confidence,
        },
      }
    : null
}
