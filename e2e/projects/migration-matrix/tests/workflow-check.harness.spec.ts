import { expect, test } from '@playwright/test'
import {
  checkWorkflow,
  rethrowUnsettledWallet,
  type WorkflowResult,
} from '../workflow-check.js'

test('a timed-out wallet can commit late, but no dependent action or migration runs', async () => {
  const records: WorkflowResult[] = []
  let resolver = 'original',
    createdChild = false,
    migrated = false
  let releaseSender!: () => void
  const sender = new Promise<void>((resolve) => {
    releaseSender = resolve
  }).then(() => {
    resolver = 'cleared'
  })
  const fixture = async () => {
    await checkWorkflow(
      async () => {
        // Cleanup sees the original pointer while the sender is still pending.
        expect(resolver).toBe('original')
        throw new Error(
          'Local matrix wallet request did not settle before the transaction deadline; fresh fixture required.',
        )
      },
      () => true,
      async () => ({ screen: 'Waiting...' }),
      (result) => records.push(result),
    )
    createdChild = true
    migrated = true
  }
  await expect(fixture()).rejects.toThrow(
    'Local matrix wallet request did not settle',
  )
  releaseSender()
  await sender
  expect(resolver).toBe('cleared')
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({
    result: 'BLOCKED',
    evidence: { screen: 'Waiting...' },
  })
  expect(createdChild).toBe(false)
  expect(migrated).toBe(false)
})

test('a loaded app assertion still fails without suppressing independent checks', async () => {
  const records: WorkflowResult[] = []
  await checkWorkflow(
    async () => {
      throw new Error('Authorized wallet was denied')
    },
    () => true,
    async () => ({ screen: 'Permission Denied' }),
    (result) => records.push(result),
  )
  await checkWorkflow(
    async () => ({ detail: 'Unrelated next check passed' }),
    () => true,
    async () => ({}),
    (result) => records.push(result),
  )
  expect(records.map((result) => result.result)).toEqual(['FAIL', 'PASS'])
})

test('an unready page or unavailable authority does not become a product failure', async () => {
  const records: WorkflowResult[] = []
  for (const [ready, message] of [
    [false, 'Empty page'],
    [true, 'Authority unavailable: RPC unavailable'],
  ] as const) {
    await checkWorkflow(
      async () => {
        throw new Error(message)
      },
      () => ready,
      async () => ({}),
      (result) => records.push(result),
    )
  }
  expect(records.map((result) => result.result)).toEqual(['BLOCKED', 'BLOCKED'])
})

test('nested record-session catches propagate the wallet interruption with its original identity', () => {
  const original = new Error(
    'Local matrix wallet request did not settle before the transaction deadline; fresh fixture required.',
  )
  const saved: string[] = []
  const recordSession = () => {
    try {
      try {
        throw original
      } catch (error) {
        saved.push('record BLOCKED')
        rethrowUnsettledWallet(error)
      }
      saved.push('later action')
    } catch (error) {
      saved.push('session BLOCKED')
      rethrowUnsettledWallet(error)
    } finally {
      saved.push('evidence saved and context closed')
    }
  }
  expect(recordSession).toThrow(original)
  expect(saved).toEqual([
    'record BLOCKED',
    'session BLOCKED',
    'evidence saved and context closed',
  ])
  expect(() =>
    rethrowUnsettledWallet(new Error('Loaded permission assertion failed')),
  ).not.toThrow()
})
