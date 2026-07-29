import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import { getRenderInputKey, parseCanonicalTokenId } from './assets.js'
import type { CommemorativeNftGeneratorBindings } from './container.js'
import {
  callContainerGenerator,
  GeneratorRequestError,
  type GeneratorResponse,
  validateGeneratorResponseForAction,
} from './generatorClient.js'
import { validateRendererInput } from './renderInput.js'

export const SEPOLIA_CHAIN_ID = 11_155_111

export type CommemorativeNftWorkflowParams = {
  readonly chainId: number
  readonly tokenId: string
}

export const GENERATION_STEP_CONFIG = {
  capture: {
    retries: { backoff: 'exponential', delay: '5 seconds', limit: 3 },
    timeout: '10 minutes',
  },
  publish: {
    retries: { backoff: 'exponential', delay: '2 seconds', limit: 5 },
    timeout: '2 minutes',
  },
  verify: {
    retries: { backoff: 'exponential', delay: '2 seconds', limit: 5 },
    timeout: '2 minutes',
  },
} as const

type GenerationWorkflowStep = Pick<WorkflowStep, 'do'>

export type GenerationWorkflowDependencies = {
  readonly callGenerator: (
    tokenId: string,
    action: 'capture' | 'publish' | 'verify',
  ) => Promise<GeneratorResponse>
  readonly loadRenderInput: (tokenId: string) => Promise<unknown | undefined>
  readonly rendererRevision: string
}

const nonRetryableGeneratorError = (error: unknown): never => {
  if (error instanceof GeneratorRequestError && !error.isRetryable) {
    throw new NonRetryableError(error.message)
  }
  throw error
}

export const runCommemorativeNftGeneration = async (
  params: CommemorativeNftWorkflowParams,
  step: GenerationWorkflowStep,
  dependencies: GenerationWorkflowDependencies,
): Promise<GeneratorResponse> => {
  if (params.chainId !== SEPOLIA_CHAIN_ID) {
    throw new NonRetryableError(`Unsupported chain ID ${params.chainId}`)
  }
  const tokenId = parseCanonicalTokenId(params.tokenId)
  if (!tokenId) {
    throw new NonRetryableError(`Invalid canonical token ID ${params.tokenId}`)
  }

  await step.do('validate render input', async () => {
    let input: unknown | undefined
    try {
      input = await dependencies.loadRenderInput(tokenId)
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new NonRetryableError(
          `Render input ${getRenderInputKey(tokenId)} is not valid JSON`,
        )
      }
      throw error
    }
    if (input === undefined) {
      throw new NonRetryableError(
        `Render input ${getRenderInputKey(tokenId)} was not found`,
      )
    }

    try {
      validateRendererInput(input)
    } catch (error) {
      throw new NonRetryableError(
        error instanceof Error ? error.message : 'Invalid render input',
      )
    }
    return { validated: true }
  })

  await step.do(
    'capture and persist media',
    GENERATION_STEP_CONFIG.capture,
    async () => {
      try {
        return validateGeneratorResponseForAction(
          await dependencies.callGenerator(tokenId, 'capture'),
          tokenId,
          'capture',
          dependencies.rendererRevision,
        )
      } catch (error) {
        return nonRetryableGeneratorError(error)
      }
    },
  )

  await step.do(
    'publish metadata',
    GENERATION_STEP_CONFIG.publish,
    async () => {
      try {
        return validateGeneratorResponseForAction(
          await dependencies.callGenerator(tokenId, 'publish'),
          tokenId,
          'publish',
          dependencies.rendererRevision,
        )
      } catch (error) {
        return nonRetryableGeneratorError(error)
      }
    },
  )

  return step.do(
    'verify persisted artifacts',
    GENERATION_STEP_CONFIG.verify,
    async () => {
      try {
        return validateGeneratorResponseForAction(
          await dependencies.callGenerator(tokenId, 'verify'),
          tokenId,
          'verify',
          dependencies.rendererRevision,
        )
      } catch (error) {
        return nonRetryableGeneratorError(error)
      }
    },
  )
}

export class CommemorativeNftGenerationWorkflow extends WorkflowEntrypoint<
  CommemorativeNftGeneratorBindings,
  CommemorativeNftWorkflowParams
> {
  override async run(
    event: Readonly<WorkflowEvent<CommemorativeNftWorkflowParams>>,
    step: WorkflowStep,
  ): Promise<GeneratorResponse> {
    return runCommemorativeNftGeneration(event.payload, step, {
      callGenerator: (tokenId, action) =>
        callContainerGenerator(this.env, tokenId, action),
      loadRenderInput: async (tokenId) => {
        const object = await this.env.COMMEMORATIVE_NFT_BUCKET.get(
          getRenderInputKey(tokenId),
        )
        return object?.json()
      },
      rendererRevision: this.env.COMMEMORATIVE_NFT_RENDERER_REVISION,
    })
  }
}
