import { SubnameMigrationImpactError } from '@ens-apps/migration'
import { TimeoutError } from 'viem'
import { describe, expect, it } from 'vitest'
import { RpcSubnameInventoryError } from './readRpcSubnameInventory'
import { shouldRetrySubnameMigrationImpact } from './subnameMigrationImpactQuery.helpers'

const timeout = new TimeoutError({ url: 'https://rpc.example', body: {} })

describe('subname impact retry policy', () => {
  it.each([
    { label: 'direct RPC failure', cause: timeout, canRetry: true },
    {
      label: 'wrapped inventory read failure',
      cause: new RpcSubnameInventoryError({
        reason: 'read-failed',
        cause: timeout,
      }),
      canRetry: true,
    },
    ...(['node-limit', 'history-limit'] as const).map((reason) => ({
      label: reason,
      cause: new RpcSubnameInventoryError({ reason, cause: timeout }),
      canRetry: false,
    })),
    {
      label: 'semantic safety failure',
      cause: new SubnameMigrationImpactError({ cause: timeout }),
      canRetry: false,
    },
    {
      label: 'invalid inventory evidence',
      cause: new RpcSubnameInventoryError({
        reason: 'read-failed',
        cause: new Error('Malformed registry log'),
      }),
      canRetry: false,
    },
  ])('retries $label only when safe', ({ cause, canRetry }) => {
    expect(shouldRetrySubnameMigrationImpact({ failureCount: 0, cause })).toBe(
      canRetry,
    )
  })

  it.each([
    { failureCount: 1, canRetry: true },
    { failureCount: 2, canRetry: false },
  ])(
    'bounds recovery after $failureCount retries',
    ({ failureCount, canRetry }) => {
      expect(
        shouldRetrySubnameMigrationImpact({ failureCount, cause: timeout }),
      ).toBe(canRetry)
    },
  )
})
