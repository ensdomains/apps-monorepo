import type { RegistrationMachineActor } from '@ens-apps/transaction-manager'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  readPendingL2Bridge,
  savePendingL2Bridge,
  subscribePendingL2Bridge,
} from './pendingL2Bridge'

const HCA = '0x1111111111111111111111111111111111111111' as const
const OTHER_HCA = '0x2222222222222222222222222222222222222222' as const

type Context = {
  l2BridgeIntentId?: bigint
  chainId: number
  accountAddress?: string
}

// Just enough of an actor to push snapshots through the subscription.
const fakeActor = (initial: Context) => {
  let listener: ((snapshot: { context: Context }) => void) | undefined
  const actor = {
    getSnapshot: () => ({ context: initial }),
    subscribe: (next: typeof listener) => {
      listener = next
      return { unsubscribe: () => {} }
    },
  }
  return {
    actor: actor as unknown as RegistrationMachineActor,
    emit: (context: Context) => listener?.({ context }),
  }
}

describe('pendingL2Bridge', () => {
  beforeEach(() => localStorage.clear())

  it('keeps one bridge per chain and account', () => {
    savePendingL2Bridge(11155111, HCA, 2n ** 250n + 1n)

    expect(readPendingL2Bridge(11155111, HCA.toUpperCase() as never)).toBe(
      2n ** 250n + 1n,
    )
    expect(readPendingL2Bridge(11155111, OTHER_HCA)).toBeUndefined()
    expect(readPendingL2Bridge(1, HCA)).toBeUndefined()
  })

  it('saves a sent bridge and drops it once it settles', () => {
    const { actor, emit } = fakeActor({
      chainId: 11155111,
      accountAddress: HCA,
    })
    subscribePendingL2Bridge(actor)

    emit({ chainId: 11155111, accountAddress: HCA, l2BridgeIntentId: 9n })
    expect(readPendingL2Bridge(11155111, HCA)).toBe(9n)

    emit({ chainId: 11155111, accountAddress: HCA })
    expect(readPendingL2Bridge(11155111, HCA)).toBeUndefined()
  })

  // A run that never had one must not clear what a cancelled run left.
  it('leaves a stored bridge alone until its run settles it', () => {
    savePendingL2Bridge(11155111, HCA, 9n)
    const { actor, emit } = fakeActor({
      chainId: 11155111,
      accountAddress: HCA,
    })
    subscribePendingL2Bridge(actor)

    emit({ chainId: 11155111, accountAddress: HCA })

    expect(readPendingL2Bridge(11155111, HCA)).toBe(9n)
  })
})
