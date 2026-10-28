import type { Address } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MigrationBatchJournalScope } from './migrationBatchJournal'
import {
  MigrationExecutionAlreadyActiveError,
  MigrationExecutionLockUnavailableError,
  withMigrationExecutionLock,
} from './migrationExecutionLock'

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const HCA: Address = '0x0000000000000000000000000000000000000002'

const scope = (
  overrides: Partial<MigrationBatchJournalScope> = {},
): MigrationBatchJournalScope => ({
  chainId: 11155111,
  owner: OWNER,
  hca: HCA,
  ...overrides,
})

const deferred = <T>() => {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred promise resolved before initialization')
  }
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

class TestLockManager implements LockManager {
  readonly requests: {
    readonly name: string
    readonly options: LockOptions
  }[] = []

  readonly #held = new Set<string>()

  request<T>(name: string, callback: LockGrantedCallback<T>): Promise<T>
  request<T>(
    name: string,
    options: LockOptions,
    callback: LockGrantedCallback<T>,
  ): Promise<T>
  async request<T>(
    name: string,
    optionsOrCallback: LockOptions | LockGrantedCallback<T>,
    callback?: LockGrantedCallback<T>,
  ): Promise<T> {
    const options =
      typeof optionsOrCallback === 'function' ? {} : optionsOrCallback
    const grant =
      typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
    if (!grant) throw new Error('Missing lock callback')

    this.requests.push({ name, options })
    if (this.#held.has(name)) {
      if (options.ifAvailable) return grant(null)
      throw new Error(
        'The test lock manager only supports ifAvailable requests',
      )
    }

    this.#held.add(name)
    try {
      return await grant({ name, mode: options.mode ?? 'exclusive' })
    } finally {
      this.#held.delete(name)
    }
  }

  async query(): Promise<LockManagerSnapshot> {
    return { held: [], pending: [] }
  }
}

const installLocks = (): TestLockManager => {
  const locks = new TestLockManager()
  vi.stubGlobal('navigator', { locks })
  return locks
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('withMigrationExecutionLock', () => {
  it('acquires a non-waiting exclusive lock and releases it after completion', async () => {
    const locks = installLocks()

    await expect(
      withMigrationExecutionLock(scope(), async () => 'complete'),
    ).resolves.toBe('complete')
    await expect(
      withMigrationExecutionLock(scope(), async () => 'next run'),
    ).resolves.toBe('next run')

    expect(locks.requests).toHaveLength(2)
    expect(locks.requests[0]?.options).toMatchObject({
      mode: 'exclusive',
      ifAvailable: true,
    })
  })

  it('refuses the same scope without starting the second operation', async () => {
    installLocks()
    const release = deferred<void>()
    const started = deferred<void>()
    const first = withMigrationExecutionLock(scope(), async () => {
      started.resolve()
      await release.promise
    })
    await started.promise

    const secondOperation = vi.fn(async () => undefined)
    await expect(
      withMigrationExecutionLock(scope(), secondOperation),
    ).rejects.toBeInstanceOf(MigrationExecutionAlreadyActiveError)
    expect(secondOperation).not.toHaveBeenCalled()

    release.resolve()
    await first
  })

  it('releases the scope after the operation fails', async () => {
    installLocks()

    await expect(
      withMigrationExecutionLock(scope(), async () => {
        throw new Error('migration failed')
      }),
    ).rejects.toThrow('migration failed')
    await expect(
      withMigrationExecutionLock(scope(), async () => 'retry'),
    ).resolves.toBe('retry')
  })

  it.each([
    {
      description: 'wallet',
      other: scope({
        owner: '0x0000000000000000000000000000000000000003',
      }),
    },
    { description: 'chain', other: scope({ chainId: 1 }) },
    {
      description: 'HCA',
      other: scope({ hca: '0x0000000000000000000000000000000000000004' }),
    },
  ])('does not block an unrelated $description scope', async ({ other }) => {
    installLocks()
    const release = deferred<void>()
    const started = deferred<void>()
    const first = withMigrationExecutionLock(scope(), async () => {
      started.resolve()
      await release.promise
    })
    await started.promise

    await expect(
      withMigrationExecutionLock(other, async () => 'unrelated'),
    ).resolves.toBe('unrelated')

    release.resolve()
    await first
  })

  it('fails closed before the operation when Web Locks are unavailable', async () => {
    vi.stubGlobal('navigator', {})
    const operation = vi.fn(async () => undefined)

    await expect(
      withMigrationExecutionLock(scope(), operation),
    ).rejects.toBeInstanceOf(MigrationExecutionLockUnavailableError)
    expect(operation).not.toHaveBeenCalled()
  })
})
