import {
  L2BridgeExpiredError,
  type L2BridgeQuote,
  type L2BridgeRoute,
} from '@ens-apps/smart-account'
import { maxUint256, UserRejectedRequestError } from 'viem'
import { baseSepolia, sepolia } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createActor, fromPromise, waitFor } from 'xstate'
import {
  L2_FUNDING_STORAGE_KEY,
  type L2FundingRecord,
  writeL2FundingRecord,
} from '../service/l2FundingPersistence'
import {
  isWithinRequoteTolerance,
  type L2FundingArrival,
  type L2FundingInput,
  l2FundingMachine,
} from './l2Funding.machine'

const OWNER = '0x1111111111111111111111111111111111111111'
const route: L2BridgeRoute = {
  owner: OWNER,
  sourceChain: baseSepolia,
  sourceToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  targetChain: sepolia,
  targetToken: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  amountOut: 5_000_000n,
}
const AGREED = 5_012_573n
const quote = (amountIn: bigint) =>
  ({
    route,
    amountIn,
    amountReceived: route.amountOut,
    deadline: 0n,
  }) as unknown as L2BridgeQuote
const record: L2FundingRecord = {
  owner: OWNER,
  sourceChainId: baseSepolia.id,
  amountOut: route.amountOut,
  amountIn: AGREED,
  intentId: 42n,
  balanceBefore: 0n,
  submittedAt: Date.now(),
}
const declined = () =>
  new UserRejectedRequestError(new Error('User rejected the request.'))

const run = ({
  allowance = maxUint256,
  approve = async () => {},
  requote = async () => quote(AGREED),
  submit = async () => {
    writeL2FundingRecord(record)
    return record
  },
  arrival = async () => ({ outcome: 'arrived' }),
  input = { route, agreedAmountIn: AGREED },
}: {
  allowance?: bigint
  approve?: () => Promise<void>
  requote?: () => Promise<L2BridgeQuote>
  submit?: () => Promise<L2FundingRecord>
  arrival?: () => Promise<L2FundingArrival>
  input?: L2FundingInput
} = {}) => {
  const calls = {
    approve: vi.fn(approve),
    requote: vi.fn(requote),
    submit: vi.fn(submit),
    arrival: vi.fn(arrival),
  }
  const actor = createActor(
    l2FundingMachine.provide({
      actors: {
        readAllowance: fromPromise<bigint, { route: L2BridgeRoute }>(
          async () => allowance,
        ),
        approvePermit2: fromPromise<void, { route: L2BridgeRoute }>(
          calls.approve,
        ),
        requote: fromPromise<L2BridgeQuote, { route: L2BridgeRoute }>(
          calls.requote,
        ),
        submit: fromPromise<L2FundingRecord, { quote: L2BridgeQuote }>(
          calls.submit,
        ),
        awaitArrival: fromPromise<
          L2FundingArrival,
          { record: L2FundingRecord }
        >(calls.arrival),
      },
    }),
    { input },
  )
  actor.start()
  return { actor, calls }
}

const finished = (actor: ReturnType<typeof run>['actor']) =>
  waitFor(actor, (snapshot) => snapshot.status === 'done')

describe('l2FundingMachine', () => {
  afterEach(() => localStorage.clear())

  it('approves Permit2 when it cannot spend enough, then signs and waits', async () => {
    const { actor, calls } = run({ allowance: 0n })
    expect((await finished(actor)).output).toEqual({ funded: true })
    expect(calls.approve).toHaveBeenCalledTimes(1)
    expect(calls.submit).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(L2_FUNDING_STORAGE_KEY)).toBeNull()
  })

  it('skips the approval when Permit2 can already spend it', async () => {
    const { actor, calls } = run()
    expect((await finished(actor)).output).toEqual({ funded: true })
    expect(calls.approve).not.toHaveBeenCalled()
  })

  it('asks again before signing a re-quote that costs over 1% more', async () => {
    const { actor, calls } = run({ requote: async () => quote(5_100_000n) })
    const review = await waitFor(actor, (s) => s.matches('review'))
    expect(review.context.review).toBe('price-changed')
    expect(calls.submit).not.toHaveBeenCalled()

    actor.send({ type: 'confirm' })
    expect((await finished(actor)).output).toEqual({ funded: true })
  })

  it.each([
    [
      'a declined approval',
      { allowance: 0n, approve: async () => Promise.reject(declined()) },
      'declined',
    ],
    [
      'a declined signature',
      { submit: async () => Promise.reject(declined()) },
      'declined',
    ],
    [
      'a signature made after the quote expired',
      {
        submit: async () =>
          Promise.reject(new L2BridgeExpiredError({ message: 'expired' })),
      },
      'expired',
    ],
  ] as const)('returns to review after %s', async (_, overrides, reason) => {
    const { actor } = run(overrides)
    const review = await waitFor(actor, (s) => s.matches('review'))
    expect(review.context.review).toBe(reason)
  })

  it('reports missing gas for the approval', async () => {
    const { actor } = run({
      allowance: 0n,
      approve: async () =>
        Promise.reject(new Error('insufficient funds for gas * price + value')),
    })
    const failed = await waitFor(actor, (s) => s.matches('failed'))
    expect(failed.context.failure).toBe('gas')
  })

  it('forgets a bridge that failed', async () => {
    const { actor } = run({ arrival: async () => ({ outcome: 'failed' }) })
    const failed = await waitFor(actor, (s) => s.matches('failed'))
    expect(failed.context.failure).toBe('bridge')
    expect(localStorage.getItem(L2_FUNDING_STORAGE_KEY)).toBeNull()
  })

  it('lets a stalled bridge be waited on, or left and forgotten', async () => {
    const { actor, calls } = run({
      arrival: async () => ({ outcome: 'stalled' }),
    })
    await waitFor(actor, (s) => s.matches('stalled'))
    actor.send({ type: 'keepWaiting' })
    await waitFor(
      actor,
      (s) => calls.arrival.mock.calls.length === 2 && s.matches('stalled'),
    )

    actor.send({ type: 'cancel' })
    expect((await finished(actor)).output).toEqual({ funded: false })
    expect(localStorage.getItem(L2_FUNDING_STORAGE_KEY)).toBeNull()
  })

  it('picks a submitted bridge back up without signing again', async () => {
    const { actor, calls } = run({
      input: { route, agreedAmountIn: AGREED, record },
    })
    expect((await finished(actor)).output).toEqual({ funded: true })
    expect(calls.requote).not.toHaveBeenCalled()
    expect(calls.submit).not.toHaveBeenCalled()
  })
})

describe('isWithinRequoteTolerance', () => {
  it('allows up to 1% more than agreed', () => {
    expect(isWithinRequoteTolerance(10_000_000n, 10_100_000n)).toBe(true)
    expect(isWithinRequoteTolerance(10_000_000n, 10_100_001n)).toBe(false)
  })
})
