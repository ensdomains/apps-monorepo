import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import {
  type AiInterpretResult,
  buildJevAiRequest,
  parseJevAiResponse,
} from './intent'
import {
  interpretJevRequest,
  type JevEnvironment,
  validateJevInput,
} from './jevBoundary'

export const interpretAiAction = createServerFn({ method: 'POST' })
  .inputValidator(validateJevInput)
  .handler(async ({ data }): Promise<AiInterpretResult> => {
    const { env } = await import('cloudflare:workers')
    return interpretJevRequest({
      entryPoint: 'ai',
      data,
      requestUrl: getRequest().url,
      environment: env as JevEnvironment,
      buildRequest: buildJevAiRequest,
      // Candidate verification remains in the evaluation harness until it
      // demonstrates a recovery benefit with no incorrect proposals.
      parseResponse: parseJevAiResponse,
      getIntent: (result) =>
        result.status === 'ok' ? result.action.intent : undefined,
    })
  })
