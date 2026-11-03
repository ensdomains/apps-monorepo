import type { RegistrationMachineActor } from '@ens-apps/transaction-manager'
import type { Hash } from 'viem'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  readPendingEthSwap,
  savePendingEthSwap,
  subscribePendingEthSwap,
} from './pendingEthSwap'

const WALLET = '0x1111111111111111111111111111111111111111' as const
const OTHER_WALLET = '0x2222222222222222222222222222222222222222' as const
const SWAP: Hash = `0x${'de'.repeat(32)}`

type Context = {
  readonly pendingEthSwap?: Hash
  readonly chainId: number
  readonly ownerAddress?: string
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

describe('pendingEthSwap', () => {
  beforeEach(() => localStorage.clear())

  it('keeps one swap per chain and wallet', () => {
    savePendingEthSwap(11155111, WALLET, SWAP)

    expect(readPendingEthSwap(11155111, WALLET.toUpperCase() as never)).toBe(
      SWAP,
    )
    expect(readPendingEthSwap(11155111, OTHER_WALLET)).toBeUndefined()
    expect(readPendingEthSwap(1, WALLET)).toBeUndefined()
  })

  it('saves a sent swap and drops it once it is counted', () => {
    const { actor, emit } = fakeActor({
      chainId: 11155111,
      ownerAddress: WALLET,
    })
    subscribePendingEthSwap(actor)

    emit({ chainId: 11155111, ownerAddress: WALLET, pendingEthSwap: SWAP })
    expect(readPendingEthSwap(11155111, WALLET)).toBe(SWAP)

    emit({ chainId: 11155111, ownerAddress: WALLET })
    expect(readPendingEthSwap(11155111, WALLET)).toBeUndefined()
  })

  // A run that never sent one must not clear what a cancelled run left.
  it('leaves a stored swap alone until a run counts it', () => {
    savePendingEthSwap(11155111, WALLET, SWAP)
    const { actor, emit } = fakeActor({
      chainId: 11155111,
      ownerAddress: WALLET,
    })
    subscribePendingEthSwap(actor)

    emit({ chainId: 11155111, ownerAddress: WALLET })

    expect(readPendingEthSwap(11155111, WALLET)).toBe(SWAP)
  })
})
