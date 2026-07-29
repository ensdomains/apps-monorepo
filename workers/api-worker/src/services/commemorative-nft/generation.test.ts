import { describe, expect, it, vi } from 'vitest'
import { KV_KEY } from '#core/kv/index.js'
import {
  createKvGenerationAdmission,
  createWorkflowGenerationCoordinator,
  GENERATION_ADMISSION_WINDOW_SECONDS,
} from './generation'

const allowAdmission = async () => true
const createCoordinator = (
  workflow: Parameters<typeof createWorkflowGenerationCoordinator>[0],
  admit: Parameters<
    typeof createWorkflowGenerationCoordinator
  >[1] = allowAdmission,
) => createWorkflowGenerationCoordinator(workflow, admit)

const makeWorkflow = (status: InstanceStatus['status']) => {
  const instance = {
    restart: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    status: vi.fn(async () => ({ status })),
  }
  const workflow = {
    create: vi.fn(async () => instance),
    get: vi.fn(async () => instance),
  } as unknown as Workflow<{
    readonly chainId: number
    readonly tokenId: string
  }>

  return { instance, workflow }
}

describe('commemorative NFT workflow coordinator', () => {
  it('reports an unavailable missing binding', async () => {
    await expect(createCoordinator(undefined).prepare('42')).resolves.toBe(
      'unavailable',
    )
  })

  it.each([
    'queued',
    'running',
    'waiting',
  ] as const)('reuses an active %s workflow', async (status) => {
    const { workflow } = makeWorkflow(status)

    await expect(
      createCoordinator(
        workflow,
        vi.fn(async () => false),
      ).prepare('42'),
    ).resolves.toBe('preparing')
    expect(workflow.create).not.toHaveBeenCalled()
  })

  it('resumes a paused workflow', async () => {
    const { instance, workflow } = makeWorkflow('paused')

    await expect(createCoordinator(workflow).prepare('42')).resolves.toBe(
      'preparing',
    )
    expect(instance.resume).toHaveBeenCalledOnce()
  })

  it('restarts a failed workflow', async () => {
    const { instance, workflow } = makeWorkflow('errored')

    await expect(createCoordinator(workflow).prepare('42')).resolves.toBe(
      'preparing',
    )
    expect(instance.restart).toHaveBeenCalledOnce()
  })

  it('rate limits a terminal workflow before restarting it', async () => {
    const { instance, workflow } = makeWorkflow('errored')

    await expect(
      createCoordinator(
        workflow,
        vi.fn(async () => false),
      ).prepare('42'),
    ).resolves.toBe('rate-limited')
    expect(instance.restart).not.toHaveBeenCalled()
  })

  it('rate limits a missing workflow before creating it', async () => {
    const { workflow } = makeWorkflow('queued')
    vi.mocked(workflow.get).mockRejectedValueOnce(
      new Error('workflow instance does not exist'),
    )

    await expect(
      createCoordinator(
        workflow,
        vi.fn(async () => false),
      ).prepare('42'),
    ).resolves.toBe('rate-limited')
    expect(workflow.create).not.toHaveBeenCalled()
  })

  it('creates a deterministic workflow when get reports a missing ID', async () => {
    const { workflow } = makeWorkflow('queued')
    vi.mocked(workflow.get).mockRejectedValueOnce(
      new Error('workflow instance does not exist'),
    )

    await expect(createCoordinator(workflow).prepare('42')).resolves.toBe(
      'preparing',
    )
    expect(workflow.create).toHaveBeenCalledWith({
      id: 'nft-11155111-42-v1',
      params: { chainId: 11155111, tokenId: '42' },
    })
  })

  it('recovers when another request wins the workflow ID race', async () => {
    const instance = {
      restart: vi.fn(async () => undefined),
      resume: vi.fn(async () => undefined),
      status: vi.fn(async () => ({ status: 'running' })),
    }
    const workflow = {
      create: vi.fn(async () => {
        throw new Error('instance already exists')
      }),
      get: vi
        .fn()
        .mockRejectedValueOnce(new Error('workflow instance does not exist'))
        .mockResolvedValueOnce(instance),
    } as unknown as Workflow<{
      readonly chainId: number
      readonly tokenId: string
    }>

    await expect(createCoordinator(workflow).prepare('42')).resolves.toBe(
      'preparing',
    )
    expect(workflow.get).toHaveBeenCalledTimes(2)
  })

  it('reports unavailable when lookup, creation, and race recovery fail', async () => {
    const workflow = {
      create: vi.fn(async () => {
        throw new Error('workflow service unavailable')
      }),
      get: vi.fn(async () => {
        throw new Error('workflow service unavailable')
      }),
    } as unknown as Workflow<{
      readonly chainId: number
      readonly tokenId: string
    }>

    await expect(createCoordinator(workflow).prepare('42')).resolves.toBe(
      'unavailable',
    )
    expect(workflow.get).toHaveBeenCalledTimes(2)
    expect(workflow.create).toHaveBeenCalledOnce()
  })

  it('restarts a completed workflow when the route found incomplete assets', async () => {
    const { instance, workflow } = makeWorkflow('complete')

    await expect(createCoordinator(workflow).prepare('42')).resolves.toBe(
      'preparing',
    )
    expect(instance.restart).toHaveBeenCalledOnce()
  })
})

describe('commemorative NFT generation admission', () => {
  it('admits one activation per token during the cooldown window', async () => {
    const values = new Map<string, string>()
    const kv = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        values.set(key, value)
      }),
    } as unknown as KVNamespace
    const admit = createKvGenerationAdmission(kv)

    await expect(admit('42')).resolves.toBe(true)
    await expect(admit('42')).resolves.toBe(false)
    await expect(admit('43')).resolves.toBe(true)
    expect(kv.put).toHaveBeenCalledWith(
      KV_KEY.COMMEMORATIVE_NFT.GENERATION_ADMISSION('42'),
      expect.any(String),
      { expirationTtl: GENERATION_ADMISSION_WINDOW_SECONDS },
    )
  })
})
