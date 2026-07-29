import type { WorkflowStep } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import {
  GeneratorRequestError,
  type GeneratorResponse,
} from './generatorClient.js'
import {
  GENERATION_STEP_CONFIG,
  runCommemorativeNftGeneration,
  SEPOLIA_CHAIN_ID,
} from './workflow.js'

const RENDERER_REVISION = 'sha256:renderer'

const INPUT = {
  animation_url: '',
  attributes: [
    { trait_type: 'Era', value: 'DeFi' },
    { trait_type: 'Depth', value: 'Collector' },
    { trait_type: 'Gasveteran', value: 'Seasoned' },
    { trait_type: 'Archetype', value: 'Abstract' },
    { trait_type: 'Rarity', value: 'Rare' },
    { trait_type: 'Seed', value: 3_780_441_947 },
  ],
  description: 'ENS commemorative NFT',
  image: '',
  name: 'yoginth.eth',
}

const ARTIFACTS: Readonly<
  Record<'json' | 'mp4' | 'png', GeneratorResponse['artifacts'][number]>
> = {
  json: {
    contentType: 'application/json; charset=utf-8',
    key: 'tokens/42.json',
    sha256: '0'.repeat(64),
    size: 42,
  },
  mp4: {
    contentType: 'video/mp4',
    key: 'tokens/42.mp4',
    sha256: '1'.repeat(64),
    size: 42,
  },
  png: {
    contentType: 'image/png',
    key: 'tokens/42.png',
    sha256: '2'.repeat(64),
    size: 42,
  },
}

const responseFor = (
  action: 'capture' | 'publish' | 'verify',
): GeneratorResponse => ({
  artifacts:
    action === 'capture'
      ? [ARTIFACTS.png, ARTIFACTS.mp4]
      : [ARTIFACTS.png, ARTIFACTS.mp4, ARTIFACTS.json],
  rendererRevision: RENDERER_REVISION,
  runtimeAdapter: 'container',
  tokenId: '42',
})

const makeStep = () => {
  const calls: Array<{ config: unknown; name: string }> = []
  const step = {
    do: async (
      name: string,
      configOrCallback: unknown,
      maybeCallback?: () => Promise<unknown>,
    ) => {
      const callback =
        typeof configOrCallback === 'function'
          ? (configOrCallback as () => Promise<unknown>)
          : maybeCallback
      calls.push({
        config:
          typeof configOrCallback === 'function' ? undefined : configOrCallback,
        name,
      })
      if (!callback) throw new Error('Missing workflow callback')
      return callback()
    },
  } as unknown as Pick<WorkflowStep, 'do'>
  return { calls, step }
}

describe('commemorative NFT generation workflow', () => {
  it('orders capture before metadata and final verification', async () => {
    const { calls, step } = makeStep()
    const actions: string[] = []
    const result = await runCommemorativeNftGeneration(
      { chainId: SEPOLIA_CHAIN_ID, tokenId: '42' },
      step,
      {
        callGenerator: vi.fn(async (_tokenId, action) => {
          actions.push(action)
          return responseFor(action)
        }),
        loadRenderInput: vi.fn(async () => INPUT),
        rendererRevision: RENDERER_REVISION,
      },
    )

    expect(actions).toEqual(['capture', 'publish', 'verify'])
    expect(calls.map(({ name }) => name)).toEqual([
      'validate render input',
      'capture and persist media',
      'publish metadata',
      'verify persisted artifacts',
    ])
    expect(calls[1].config).toEqual(GENERATION_STEP_CONFIG.capture)
    expect(calls[2].config).toEqual(GENERATION_STEP_CONFIG.publish)
    expect(calls[3].config).toEqual(GENERATION_STEP_CONFIG.verify)
    expect(result).toEqual(responseFor('verify'))
  })

  it('treats invalid input and unsupported output as non-retryable', async () => {
    const first = makeStep()
    const callGenerator = vi.fn(async (_tokenId, action) => responseFor(action))
    await expect(
      runCommemorativeNftGeneration(
        { chainId: SEPOLIA_CHAIN_ID, tokenId: '42' },
        first.step,
        {
          callGenerator,
          loadRenderInput: vi.fn(async () => undefined),
          rendererRevision: RENDERER_REVISION,
        },
      ),
    ).rejects.toMatchObject({ name: 'NonRetryableError' })
    expect(callGenerator).not.toHaveBeenCalled()

    const malformedJson = makeStep()
    await expect(
      runCommemorativeNftGeneration(
        { chainId: SEPOLIA_CHAIN_ID, tokenId: '42' },
        malformedJson.step,
        {
          callGenerator,
          loadRenderInput: vi.fn(async () => {
            throw new SyntaxError('Unexpected token')
          }),
          rendererRevision: RENDERER_REVISION,
        },
      ),
    ).rejects.toMatchObject({ name: 'NonRetryableError' })

    const second = makeStep()
    await expect(
      runCommemorativeNftGeneration(
        { chainId: SEPOLIA_CHAIN_ID, tokenId: '42' },
        second.step,
        {
          callGenerator: vi.fn(async () => {
            throw new GeneratorRequestError(
              'unsupported renderer output',
              false,
            )
          }),
          loadRenderInput: vi.fn(async () => INPUT),
          rendererRevision: RENDERER_REVISION,
        },
      ),
    ).rejects.toMatchObject({ name: 'NonRetryableError' })
  })

  it('rejects non-canonical token IDs and incomplete generator output', async () => {
    const invalidToken = makeStep()
    const callGenerator = vi.fn(async (_tokenId, action) => responseFor(action))
    await expect(
      runCommemorativeNftGeneration(
        { chainId: SEPOLIA_CHAIN_ID, tokenId: '042' },
        invalidToken.step,
        {
          callGenerator,
          loadRenderInput: vi.fn(async () => INPUT),
          rendererRevision: RENDERER_REVISION,
        },
      ),
    ).rejects.toMatchObject({ name: 'NonRetryableError' })
    expect(callGenerator).not.toHaveBeenCalled()

    const incompleteOutput = makeStep()
    await expect(
      runCommemorativeNftGeneration(
        { chainId: SEPOLIA_CHAIN_ID, tokenId: '42' },
        incompleteOutput.step,
        {
          callGenerator: vi.fn(async (_tokenId, action) =>
            action === 'capture'
              ? { ...responseFor(action), artifacts: [ARTIFACTS.png] }
              : responseFor(action),
          ),
          loadRenderInput: vi.fn(async () => INPUT),
          rendererRevision: RENDERER_REVISION,
        },
      ),
    ).rejects.toMatchObject({ name: 'NonRetryableError' })

    const staleRenderer = makeStep()
    await expect(
      runCommemorativeNftGeneration(
        { chainId: SEPOLIA_CHAIN_ID, tokenId: '42' },
        staleRenderer.step,
        {
          callGenerator: vi.fn(async (_tokenId, action) => ({
            ...responseFor(action),
            rendererRevision: 'sha256:stale',
          })),
          loadRenderInput: vi.fn(async () => INPUT),
          rendererRevision: RENDERER_REVISION,
        },
      ),
    ).rejects.toMatchObject({ name: 'NonRetryableError' })
  })
})
