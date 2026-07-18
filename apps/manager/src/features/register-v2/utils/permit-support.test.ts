import type { Address, Client } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { supportsPermit2612 } from './permit-support'

const TOKEN = '0x000000000000000000000000000000000000dEaD' as Address

// Mock viem's readContract so the probe is exercised without a live chain.
const { readContract } = vi.hoisted(() => ({ readContract: vi.fn() }))
vi.mock('viem/actions', () => ({ readContract }))

const client = {} as Client

describe('supportsPermit2612', () => {
  it('returns true when both nonces() and DOMAIN_SEPARATOR() resolve', async () => {
    readContract.mockImplementation(
      (_c: unknown, args: { functionName: string }) =>
        args.functionName === 'nonces'
          ? Promise.resolve(0n)
          : Promise.resolve(`0x${'11'.repeat(32)}`),
    )
    await expect(supportsPermit2612(client, TOKEN)).resolves.toBe(true)
  })

  it('returns false when nonces() reverts (has DOMAIN_SEPARATOR but no 2612 pair)', async () => {
    readContract.mockImplementation(
      (_c: unknown, args: { functionName: string }) =>
        args.functionName === 'nonces'
          ? Promise.reject(new Error('function does not exist'))
          : Promise.resolve(`0x${'11'.repeat(32)}`),
    )
    await expect(supportsPermit2612(client, TOKEN)).resolves.toBe(false)
  })

  it('returns false when DOMAIN_SEPARATOR() reverts', async () => {
    readContract.mockImplementation(
      (_c: unknown, args: { functionName: string }) =>
        args.functionName === 'DOMAIN_SEPARATOR'
          ? Promise.reject(new Error('function does not exist'))
          : Promise.resolve(0n),
    )
    await expect(supportsPermit2612(client, TOKEN)).resolves.toBe(false)
  })

  it('returns false when the token has no code (both revert)', async () => {
    readContract.mockRejectedValue(new Error('no code'))
    await expect(supportsPermit2612(client, TOKEN)).resolves.toBe(false)
  })
})
