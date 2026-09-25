import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import {
  type AiInterpretResult,
  buildJevAiRequest,
  parseJevAiResponse,
} from './intent'
import {
  callJev,
  isValidJevQuery,
  type JevEnvironment,
  logJevOutcome,
  validateJevInput,
  verifyJevAccess,
} from './jevBoundary'

export const interpretAiAction = createServerFn({ method: 'POST' })
  .inputValidator(validateJevInput)
  .handler(async ({ data }): Promise<AiInterpretResult> => {
    const startedAt = Date.now()
    const finish = (result: AiInterpretResult) => {
      logJevOutcome(
        'ai',
        result.status,
        startedAt,
        result.status === 'ok' ? result.action.intent : undefined,
      )
      return result
    }
    if (!isValidJevQuery(data.query)) return finish({ status: 'unsupported' })

    const { env } = await import('cloudflare:workers')
    const environment = env as JevEnvironment
    const access = await verifyJevAccess({
      authToken: data.authToken,
      requestUrl: getRequest().url,
      environment,
    })
    if (access.status !== 'ok') return finish({ status: access.status })

    const response = await callJev(buildJevAiRequest(data.query), environment)
    if (response.status !== 'ok') return finish({ status: response.status })
    return finish(
      parseJevAiResponse(response.body, data.query) ?? {
        status: 'unsupported',
      },
    )
  })
