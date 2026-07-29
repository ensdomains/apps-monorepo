import { describe, expect, it, vi } from 'vitest'
import { createWorkflowGenerationCoordinator } from './generation'

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
    await expect(
      createWorkflowGenerationCoordinator(undefined).prepare('42'),
    ).resolves.toBe('unavailable')
  })

  it.each([
    'queued',
    'running',
    'waiting',
  ] as const)('reuses an active %s workflow', async (status) => {
    const { workflow } = makeWorkflow(status)

    await expect(
      createWorkflowGenerationCoordinator(workflow).prepare('42'),
    ).resolves.toBe('preparing')
    expect(workflow.create).not.toHaveBeenCalled()
  })

  it('resumes a paused workflow', async () => {
    const { instance, workflow } = makeWorkflow('paused')

    await expect(
      createWorkflowGenerationCoordinator(workflow).prepare('42'),
    ).resolves.toBe('preparing')
    expect(instance.resume).toHaveBeenCalledOnce()
  })

  it('restarts a failed workflow', async () => {
    const { instance, workflow } = makeWorkflow('errored')

    await expect(
      createWorkflowGenerationCoordinator(workflow).prepare('42'),
    ).resolves.toBe('preparing')
    expect(instance.restart).toHaveBeenCalledOnce()
  })

  it('creates a deterministic workflow when get reports a missing ID', async () => {
    const { workflow } = makeWorkflow('queued')
    vi.mocked(workflow.get).mockRejectedValueOnce(
      new Error('workflow instance does not exist'),
    )

    await expect(
      createWorkflowGenerationCoordinator(workflow).prepare('42'),
    ).resolves.toBe('preparing')
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

    await expect(
      createWorkflowGenerationCoordinator(workflow).prepare('42'),
    ).resolves.toBe('preparing')
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

    await expect(
      createWorkflowGenerationCoordinator(workflow).prepare('42'),
    ).resolves.toBe('unavailable')
    expect(workflow.get).toHaveBeenCalledTimes(2)
    expect(workflow.create).toHaveBeenCalledOnce()
  })

  it('restarts a completed workflow when the route found incomplete assets', async () => {
    const { instance, workflow } = makeWorkflow('complete')

    await expect(
      createWorkflowGenerationCoordinator(workflow).prepare('42'),
    ).resolves.toBe('preparing')
    expect(instance.restart).toHaveBeenCalledOnce()
  })
})
