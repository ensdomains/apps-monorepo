import type { Address, Hash, Hex, PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import { createActor, fromPromise, waitFor } from 'xstate'
import {
  TransactionSubmissionError,
  TransactionUserRejectedError,
} from '../../errors/transaction.errors'
import type { Signer } from '../../types/signer.types'
import type { TransactionRequest } from '../../types/transaction.types'
import type { HcaSessionEnableParams } from './registration.hca.actors'
import { registrationMachine } from './registration.machine'

const HCA = '0xaaaa000000000000000000000000000000000001' as Address
const WALLET = '0x1111111111111111111111111111111111111111' as Address
const BUDGET = 15_000_000n
const RESOLVER = '0xbbbb000000000000000000000000000000000002' as Address
const COMMITMENT = `0x${'ab'.repeat(32)}` as Hash
const SECRET = `0x${'cd'.repeat(32)}` as Hex

const permit = {
  owner: WALLET,
  spender: HCA,
  value: BUDGET,
  deadline: 1_800_000_000n,
  v: 27,
  r: `0x${'11'.repeat(32)}`,
  s: `0x${'22'.repeat(32)}`,
} as const

/**
 * Stand-in for the stored session-enable proof. The owner signs the session
 * authorization once; this payload is rebuilt from storage on every run.
 */
const SESSION_ENABLE = {
  enableData: { stub: 'enable-data' },
  permissionId: `0x${'33'.repeat(32)}`,
  sessionKey: '0x2222222222222222222222222222222222222222',
  validUntil: 2_000_000_000n,
} as unknown as HcaSessionEnableParams

/**
 * Stub only the standalone-HCA actors the funding path walks through. Anything
 * further down the flow (commitment polling, reveal) never starts because the
 * assertions stop at the funding decision.
 */
const startHcaRegistration = (overrides: {
  /** HCA USDC balance per `checkingHcaFunding` visit (last value repeats). */
  balances?: bigint[]
  signFundingPermit?: ReturnType<typeof vi.fn>
  submitFundingAndCommit?: ReturnType<typeof vi.fn>
  /** Overrides the balance stub entirely (e.g. to simulate an RPC failure). */
  readHcaUsdcBalance?: ReturnType<typeof vi.fn>
  estimateHcaBudget?: ReturnType<typeof vi.fn>
  hcaBudget?: bigint
  /** The USDC wallet debit the confirm screen showed, if any. */
  displayedWalletDebit?: bigint
  /** Stored session-enable proof, as rebuilt from storage on every run. */
  hcaSessionEnable?: HcaSessionEnableParams
  pollTransactionStatus?: ReturnType<typeof vi.fn>
  validateCommitment?: ReturnType<typeof vi.fn>
  /** Orchestrator status lookup for the reveal intent. */
  fetchIntentStatus?: (intentId: bigint) => Promise<string | null>
}) => {
  const estimateHcaBudget =
    overrides.estimateHcaBudget ??
    vi.fn(async () => ({
      total: BUDGET,
      commitCost: 4_000_000n,
      registerCost: 6_000_000n,
      registrationPrice: 5_000_000n,
      // price + HCA_MAX_LEG_FEES_USDC — the ceiling the estimator accepted this
      // budget under, and the bound the permit is then checked against.
      expectedMaximum: 30_000_000n,
      source: 'quote' as const,
    }))
  const signFundingPermit =
    overrides.signFundingPermit ?? vi.fn(async () => permit)
  const submitFundingAndCommit =
    overrides.submitFundingAndCommit ??
    vi.fn(() => new Promise(() => {})) /* park: assertions stop here */

  const balances = overrides.balances ?? [0n]
  let fundingChecks = 0

  const actor = createActor(
    registrationMachine.provide({
      actors: {
        estimateHcaBudget: fromPromise(estimateHcaBudget) as never,
        readHcaUsdcBalance: fromPromise(
          overrides.readHcaUsdcBalance ??
            (async () => {
              const balance =
                balances[Math.min(fundingChecks, balances.length - 1)] ?? 0n
              fundingChecks += 1
              return balance
            }),
        ) as never,
        signFundingPermit: fromPromise(signFundingPermit) as never,
        submitFundingAndCommit: fromPromise(submitFundingAndCommit) as never,
        ...(overrides.pollTransactionStatus && {
          pollTransactionStatus: fromPromise(
            overrides.pollTransactionStatus,
          ) as never,
        }),
        ...(overrides.validateCommitment && {
          validateCommitment: fromPromise(
            overrides.validateCommitment,
          ) as never,
        }),
      },
    }),
    { input: { chainId: sepolia.id } },
  )

  actor.start()
  actor.send({
    type: 'START_REGISTRATION',
    name: 'myname.eth',
    duration: 31_536_000n,
    token: 'USDC',
    price: 5_000_000n,
    signer: { type: 'rhinestone' } as unknown as Signer,
    accountAddress: HCA,
    ownerAddress: WALLET,
    publicClient: { chain: sepolia } as unknown as PublicClient,
    hcaSessionEnable: overrides.hcaSessionEnable ?? SESSION_ENABLE,
    ...(overrides.hcaBudget !== undefined
      ? { hcaBudget: overrides.hcaBudget }
      : {}),
    ...(overrides.displayedWalletDebit !== undefined
      ? { displayedWalletDebit: overrides.displayedWalletDebit }
      : {}),
    ...(overrides.fetchIntentStatus
      ? { fetchIntentStatus: overrides.fetchIntentStatus }
      : {}),
  })

  return { actor, estimateHcaBudget, signFundingPermit, submitFundingAndCommit }
}

const EOA_RESOLVER = '0xcccc000000000000000000000000000000000003' as Address
const EOA_COMMITMENT = {
  commitment: `0x${'44'.repeat(32)}`,
  secret: `0x${'55'.repeat(32)}`,
} as const

/**
 * Pure-EOA leg: resolver check (→ deployment) → commitment generation →
 * commit. Only the actors up to the commit are stubbed; the assertions stop
 * there.
 */
const startEoaRegistration = (overrides: {
  checkResolverDeployment?: ReturnType<typeof vi.fn>
  deployResolver?: ReturnType<typeof vi.fn>
  resolveResolverDeployment?: ReturnType<typeof vi.fn>
  generateCommitment?: ReturnType<typeof vi.fn>
  submitCommitment?: ReturnType<typeof vi.fn>
  /** Stubbed only by the tests that walk past the commit. */
  submitRegistration?: ReturnType<typeof vi.fn>
  verifyRegistration?: ReturnType<typeof vi.fn>
}) => {
  const checkResolverDeployment =
    overrides.checkResolverDeployment ??
    vi.fn(async () => ({ resolverAddress: EOA_RESOLVER, deployed: false }))
  const deployResolver =
    overrides.deployResolver ??
    vi.fn(async () => ({ txId: 'resolver-tx', salt: 1n }))
  const resolveResolverDeployment =
    overrides.resolveResolverDeployment ??
    vi.fn(async () => ({ resolverAddress: EOA_RESOLVER }))
  const generateCommitment =
    overrides.generateCommitment ?? vi.fn(async () => EOA_COMMITMENT)
  const submitCommitment =
    overrides.submitCommitment ??
    vi.fn(() => new Promise(() => {})) /* park: assertions stop here */
  const submitRegistration =
    overrides.submitRegistration ?? vi.fn(() => new Promise(() => {}))
  const verifyRegistration =
    overrides.verifyRegistration ??
    vi.fn(async () => ({ verified: false, registeredToOther: false }))

  const actor = createActor(
    registrationMachine.provide({
      actors: {
        checkResolverDeployment: fromPromise(checkResolverDeployment) as never,
        deployResolver: fromPromise(deployResolver) as never,
        resolveResolverDeployment: fromPromise(
          resolveResolverDeployment,
        ) as never,
        generateCommitment: fromPromise(generateCommitment) as never,
        submitCommitment: fromPromise(submitCommitment) as never,
        // The cooldown spine: nothing to assert on, so each step resolves
        // straight through to the reveal.
        pollTransactionStatus: fromPromise(async () => undefined) as never,
        readMinCommitmentAge: fromPromise(async () => 0n) as never,
        readPaymentAuthorization: fromPromise(async () => ({
          allowance: 10n,
          livePrice: 10n,
        })) as never,
        waitAfterCommitment: fromPromise(async () => undefined) as never,
        submitRegistration: fromPromise(submitRegistration) as never,
        verifyRegistration: fromPromise(verifyRegistration) as never,
      },
    }),
    { input: { chainId: sepolia.id } },
  )

  actor.start()
  actor.send({
    type: 'START_REGISTRATION',
    name: 'myname.eth',
    duration: 31_536_000n,
    token: 'USDC',
    price: 5_000_000n,
    signer: { type: 'eoa' } as unknown as Signer,
    accountAddress: WALLET,
    ownerAddress: WALLET,
    publicClient: { chain: sepolia } as unknown as PublicClient,
  })

  return {
    actor,
    checkResolverDeployment,
    deployResolver,
    generateCommitment,
    submitCommitment,
    submitRegistration,
    verifyRegistration,
  }
}

describe('registrationMachine — standalone-HCA funding', () => {
  it('skips the funding permit when the HCA already covers the budget', async () => {
    const { actor, signFundingPermit } = startHcaRegistration({
      balances: [BUDGET],
    })

    await waitFor(actor, (s) => s.matches('submittingSetupBundle'))

    // Leftover budget from a prior registration ⇒ zero extra wallet prompts.
    expect(signFundingPermit).not.toHaveBeenCalled()
    expect(actor.getSnapshot().context.permit).toBeUndefined()
  })

  it('signs a funding permit for the SHORTFALL, not the whole budget', async () => {
    // The HCA keeps unspent budget from prior registrations. Permitting the
    // full budget on top of that leftover re-funds it every run and ratchets
    // the balance up, so the permit must cover only the difference.
    const balance = 1_504_912n
    const { actor, signFundingPermit } = startHcaRegistration({
      balances: [balance],
    })

    await waitFor(actor, (s) => s.matches('submittingSetupBundle'))

    expect(signFundingPermit).toHaveBeenCalledOnce()
    expect(signFundingPermit.mock.calls[0][0].input).toMatchObject({
      wallet: WALLET,
      hca: HCA,
      value: BUDGET - balance,
    })
    expect(actor.getSnapshot().context.permit).toEqual(permit)
  })

  it('permits the full budget when the balance read fails', async () => {
    // An unreadable balance must not be guessed at: over-permitting leaves the
    // surplus in the user-owned HCA, whereas assuming funds we could not see
    // risks an under-funded reveal that reverts.
    const { actor, signFundingPermit } = startHcaRegistration({
      readHcaUsdcBalance: vi.fn(async () => {
        throw new Error('rpc down')
      }),
    })

    await waitFor(actor, (s) => s.matches('submittingSetupBundle'))

    expect(signFundingPermit.mock.calls[0][0].input).toMatchObject({
      value: BUDGET,
    })
  })

  it('bounds the permit it asks for by the ceiling and the displayed figure', async () => {
    // `value` is derived from figures the orchestrator returned over HTTP, so
    // the actor is handed both bounds it must re-check before prompting: one
    // computed from the on-chain price, one from what the user was shown. Both
    // net off the standing balance exactly as `value` does.
    const balance = 1_000_000n
    const { actor, signFundingPermit } = startHcaRegistration({
      balances: [balance],
      displayedWalletDebit: BUDGET - balance,
    })

    await waitFor(actor, (s) => s.matches('submittingSetupBundle'))

    expect(signFundingPermit.mock.calls[0][0].input).toMatchObject({
      value: BUDGET - balance,
      bounds: {
        expectedMaximum: 30_000_000n - balance,
        displayedValue: BUDGET - balance,
      },
    })
  })

  it('passes no consent bound when checkout had no figure to show', async () => {
    // A failed budget quote leaves the confirm screen showing the rent alone.
    // There is nothing the user consented to, so only the independent ceiling
    // applies — inventing a bound here would block a legitimate registration.
    const { actor, signFundingPermit } = startHcaRegistration({
      balances: [0n],
    })

    await waitFor(actor, (s) => s.matches('submittingSetupBundle'))

    const { bounds } = signFundingPermit.mock.calls[0][0].input
    expect(bounds.displayedValue).toBeUndefined()
    expect(bounds.expectedMaximum).toBe(30_000_000n)
  })

  it('requests no signature when the budget estimate is refused', async () => {
    // The estimator throws when the orchestrator's figures exceed the expected
    // maximum. The flow must stop there — the wallet is never reached.
    const { actor, signFundingPermit } = startHcaRegistration({
      estimateHcaBudget: vi.fn(async () => {
        throw new Error('above the expected maximum of 30 USDC')
      }),
    })

    await waitFor(actor, (s) => s.matches('error'))

    expect(signFundingPermit).not.toHaveBeenCalled()
    expect(actor.getSnapshot().context.error?.message).toMatch(
      /above the expected maximum/,
    )
    // Retryable: a transient bad quote should not strand the user.
    expect(actor.getSnapshot().context.retryTarget).toBe('computingHcaBudget')
  })

  it('honours a caller-supplied budget instead of estimating one', async () => {
    const { actor, estimateHcaBudget } = startHcaRegistration({
      hcaBudget: 42_000_000n,
      balances: [42_000_000n],
    })

    await waitFor(actor, (s) => s.matches('submittingSetupBundle'))

    expect(estimateHcaBudget).not.toHaveBeenCalled()
    expect(actor.getSnapshot().context.hcaBudget).toBe(42_000_000n)
  })

  it('discards the signed permit on retry so an expired one is never resubmitted', async () => {
    // The EIP-2612 permit carries a 1-hour deadline; retrying with the stored
    // signature after that window reverts every attempt. The retry must go back
    // through the funding check, which either skips the permit (the HCA was
    // funded by the failed attempt) or signs a fresh one.
    const submitFundingAndCommit = vi
      .fn()
      .mockRejectedValueOnce(new Error('relayer rejected the intent'))
      .mockImplementation(() => new Promise(() => {}))

    // Second visit sees the HCA funded by the attempt that failed afterwards.
    const { actor, signFundingPermit } = startHcaRegistration({
      balances: [BUDGET - 1n, BUDGET],
      submitFundingAndCommit,
    })

    await waitFor(actor, (s) => s.matches('error'))
    expect(actor.getSnapshot().context.permit).toEqual(permit)
    expect(actor.getSnapshot().context.retryTarget).toBe(
      'submittingSetupBundle',
    )

    actor.send({ type: 'RETRY' })
    await waitFor(actor, (s) => s.matches('submittingSetupBundle'))

    // Re-entering the funding check found the HCA funded, so the retry carries
    // no permit at all rather than replaying the expiring signature.
    expect(actor.getSnapshot().context.permit).toBeUndefined()
    expect(signFundingPermit).toHaveBeenCalledOnce()
    // A stale commitment is cleared too, so the reveal can't bind to it.
    expect(actor.getSnapshot().context.commitmentTxId).toBeUndefined()
  })
})

describe('registrationMachine — pure-EOA commitment retry', () => {
  it('regenerates the commitment on retry instead of committing nothing', async () => {
    // A failed generation leaves `commitment` unset. Retrying the commit
    // directly submits `undefined`, which throws a TypeError back into `error`
    // with the same target — every further retry reproduces it, and the user
    // sees the TypeError instead of the RPC error that actually failed.
    const generateCommitment = vi
      .fn()
      .mockRejectedValueOnce(new Error('rpc hiccup on the registrar read'))
      .mockImplementation(async () => EOA_COMMITMENT)

    const { actor, submitCommitment } = startEoaRegistration({
      generateCommitment,
    })

    await waitFor(actor, (s) => s.matches('error'))
    expect(actor.getSnapshot().context.commitment).toBeUndefined()
    expect(actor.getSnapshot().context.retryTarget).toBe('preparingCommitment')

    actor.send({ type: 'RETRY' })
    await waitFor(actor, (s) => s.matches('committingTransaction'))

    expect(generateCommitment).toHaveBeenCalledTimes(2)
    expect(submitCommitment.mock.calls[0][0].input.commitment).toEqual(
      EOA_COMMITMENT,
    )
    // The resolver is already on-chain — the retry must not redeploy it.
    expect(actor.getSnapshot().context.resolverAddress).toBe(EOA_RESOLVER)
  })
})

describe('registrationMachine — pure-EOA resolver reuse', () => {
  it("deploys the wallet's resolver on its first registration", async () => {
    const { actor, deployResolver, generateCommitment } = startEoaRegistration(
      {},
    )

    await waitFor(actor, (s) => s.matches('committingTransaction'))

    expect(deployResolver).toHaveBeenCalledOnce()
    expect(generateCommitment.mock.calls[0][0].input.resolverAddress).toBe(
      EOA_RESOLVER,
    )
  })

  it('reuses the resolver an earlier registration deployed', async () => {
    const { actor, deployResolver, generateCommitment } = startEoaRegistration({
      checkResolverDeployment: vi.fn(async () => ({
        resolverAddress: EOA_RESOLVER,
        deployed: true,
      })),
    })

    await waitFor(actor, (s) => s.matches('committingTransaction'))

    expect(deployResolver).not.toHaveBeenCalled()
    expect(actor.getSnapshot().context.resolverTxId).toBeUndefined()
    expect(generateCommitment.mock.calls[0][0].input.resolverAddress).toBe(
      EOA_RESOLVER,
    )
  })

  it('checks again on retry instead of redeploying a resolver that landed', async () => {
    // The receipt wait failed, but the deploy went through. Its address is
    // fixed, so sending it again would revert.
    const checkResolverDeployment = vi
      .fn()
      .mockResolvedValueOnce({ resolverAddress: EOA_RESOLVER, deployed: false })
      .mockResolvedValue({ resolverAddress: EOA_RESOLVER, deployed: true })
    const { actor, deployResolver } = startEoaRegistration({
      checkResolverDeployment,
      resolveResolverDeployment: vi
        .fn()
        .mockRejectedValue(new Error('receipt timeout')),
    })

    await waitFor(actor, (s) => s.matches('error'))
    expect(actor.getSnapshot().context.retryTarget).toBe('checkingResolver')

    actor.send({ type: 'RETRY' })
    await waitFor(actor, (s) => s.matches('committingTransaction'))

    expect(checkResolverDeployment).toHaveBeenCalledTimes(2)
    expect(deployResolver).toHaveBeenCalledOnce()
    expect(actor.getSnapshot().context.resolverAddress).toBe(EOA_RESOLVER)
  })
})

describe('registrationMachine — losing a same-name race', () => {
  // Two people register the same name at once: both commits land, then the
  // loser's reveal reverts because the winner already owns the label. Retrying
  // can never succeed, so the flow has to stop instead of resubmitting — and
  // above all must not start over with a fresh (paid-for) commitment.

  const raceLostRun = () =>
    startEoaRegistration({
      submitCommitment: vi.fn(async () => 'commit-tx'),
      submitRegistration: vi
        .fn()
        .mockRejectedValue(new Error('execution reverted: name not available')),
      verifyRegistration: vi.fn(async () => ({
        verified: false,
        registeredToOther: true,
      })),
    })

  it('ends the flow when the name is already owned by another address', async () => {
    const { actor, verifyRegistration } = raceLostRun()

    await waitFor(actor, (s) => s.matches('error'))

    // The failure is decided by the chain, not by the revert string.
    expect(verifyRegistration).toHaveBeenCalledOnce()
    const { context } = actor.getSnapshot()
    expect(context.nameUnavailable).toBe(true)
    expect(context.retryTarget).toBeUndefined()
    expect(context.error?.message).toMatch(/registered by another address/i)
  })

  it('refuses RETRY instead of re-committing for a name it cannot win', async () => {
    const { actor, submitCommitment, submitRegistration } = raceLostRun()

    await waitFor(actor, (s) => s.matches('error'))
    const commitsBefore = submitCommitment.mock.calls.length
    const registersBefore = submitRegistration.mock.calls.length

    actor.send({ type: 'RETRY' })
    actor.send({ type: 'RETRY' })

    // Without the guard the catch-all RETRY branch restarts at
    // `checkingResolver`, paying for a fresh commitment on every press.
    expect(actor.getSnapshot().matches('error')).toBe(true)
    expect(submitCommitment.mock.calls.length).toBe(commitsBefore)
    expect(submitRegistration.mock.calls.length).toBe(registersBefore)
  })

  it('still offers a retry when the name is simply not registered yet', async () => {
    // A declined wallet prompt looks the same to the machine until it reads
    // the chain: nobody owns the label, so the user can try again.
    const { actor } = startEoaRegistration({
      submitCommitment: vi.fn(async () => 'commit-tx'),
      submitRegistration: vi
        .fn()
        .mockRejectedValue(new Error('User rejected the request')),
      verifyRegistration: vi.fn(async () => ({
        verified: false,
        registeredToOther: false,
        reason: 'label is not REGISTERED (status 0)',
      })),
    })

    await waitFor(actor, (s) => s.matches('error'))

    const { context } = actor.getSnapshot()
    expect(context.nameUnavailable).toBeUndefined()
    expect(context.retryTarget).toBe('registeringDomain')
    // Nothing reached the chain, so the check's "not registered" says nothing:
    // the user sees why the reveal failed, not the registry read.
    expect(context.error?.message).toBe('User rejected the request')
    expect(context.revealSubmitFailed).toBeUndefined()
  })

  it('reads the chain once after a rejected reveal instead of grace-polling', async () => {
    const { actor, verifyRegistration } = startEoaRegistration({
      submitCommitment: vi.fn(async () => 'commit-tx'),
      submitRegistration: vi
        .fn()
        .mockRejectedValue(new Error('User rejected the request')),
      verifyRegistration: vi.fn(async () => ({
        verified: false,
        registeredToOther: false,
      })),
    })

    await waitFor(actor, (s) => s.matches('error'))

    // The grace window waits for a transaction to land; a rejected reveal
    // sent none, so waiting would only hold the error screen back for 30s.
    expect(verifyRegistration.mock.calls[0][0].input.graceWindowMs).toBe(0)
  })

  it('succeeds when the failed reveal actually landed on-chain', async () => {
    const { actor } = startEoaRegistration({
      submitCommitment: vi.fn(async () => 'commit-tx'),
      submitRegistration: vi.fn().mockRejectedValue(new Error('rpc timeout')),
      verifyRegistration: vi.fn(async () => ({
        verified: true,
        registeredToOther: false,
      })),
    })

    await waitFor(actor, (s) => s.matches('success'))
    expect(actor.getSnapshot().context.error).toBeUndefined()
  })
})

describe('registrationMachine — session-enable proof', () => {
  // The proof is attached to every leg: the stateless validator rejects any
  // session signature without it (`InvalidSessionData()`, surfaced by the
  // router as `UnclassifiedRevert`).

  it('attaches the enable proof whenever it funds', async () => {
    const { actor, submitFundingAndCommit } = startHcaRegistration({
      balances: [BUDGET - 1n],
    })

    await waitFor(actor, (s) => s.matches('submittingSetupBundle'))

    const input = submitFundingAndCommit.mock.calls[0][0].input
    expect(input.permit).toEqual(permit)
    // The proof is reusable, so re-presenting it costs no wallet prompt.
    expect(input.sessionEnable).toEqual(SESSION_ENABLE)
  })

  it('still attaches the enable proof when the HCA needs no funding', async () => {
    // Regression: the proof used to be gated on "we are funding", so a commit
    // covered by leftover balance went out without it and was rejected.
    const { actor, submitFundingAndCommit } = startHcaRegistration({
      balances: [BUDGET],
    })

    await waitFor(actor, (s) => s.matches('submittingSetupBundle'))

    const input = submitFundingAndCommit.mock.calls[0][0].input
    expect(input.permit).toBeUndefined()
    expect(input.sessionEnable).toEqual(SESSION_ENABLE)
  })
})

describe('registrationMachine — failed commit send', () => {
  const sendFailed = new TransactionSubmissionError(
    {} as TransactionRequest,
    new Error('Internal JSON-RPC error.'),
  )

  const startEoaRegistration = (overrides: {
    generateCommitment?: ReturnType<typeof vi.fn>
    submitCommitment?: ReturnType<typeof vi.fn>
    validateCommitment?: ReturnType<typeof vi.fn>
  }) => {
    const actor = createActor(
      registrationMachine.provide({
        actors: {
          checkResolverDeployment: fromPromise(async () => ({
            resolverAddress: HCA,
            deployed: false,
          })) as never,
          deployResolver: fromPromise(async () => ({
            txId: 'deploy',
            salt: 1n,
          })) as never,
          resolveResolverDeployment: fromPromise(async () => ({
            resolverAddress: HCA,
          })) as never,
          generateCommitment: fromPromise(
            overrides.generateCommitment ?? (async () => ({})),
          ) as never,
          submitCommitment: fromPromise(
            overrides.submitCommitment ?? (async () => 'commit'),
          ) as never,
          pollTransactionStatus: fromPromise(async () => {
            throw sendFailed
          }) as never,
          validateCommitment: fromPromise(
            overrides.validateCommitment ?? (() => new Promise(() => {})),
          ) as never,
        },
      }),
      { input: { chainId: sepolia.id } },
    )
    actor.start()
    actor.send({
      type: 'START_REGISTRATION',
      name: 'myname.eth',
      duration: 31_536_000n,
      token: 'USDC',
      price: 5_000_000n,
      signer: { type: 'eoa' } as unknown as Signer,
      accountAddress: WALLET,
      publicClient: { chain: sepolia } as unknown as PublicClient,
    })
    return actor
  }

  it('fails an EOA commit the wallet could not send straight away', async () => {
    const validateCommitment = vi.fn(() => new Promise(() => {}))
    const actor = startEoaRegistration({ validateCommitment })

    await waitFor(actor, (s) => s.matches('error'))

    expect(validateCommitment).not.toHaveBeenCalled()
    expect(actor.getSnapshot().context.retryTarget).toBe('preparingCommitment')
  })

  it('retries with a fresh commitment, since the failed one may have landed', async () => {
    const generateCommitment = vi
      .fn()
      .mockResolvedValueOnce({ commitment: '0x01' })
      .mockResolvedValueOnce({ commitment: '0x02' })
    const submitCommitment = vi.fn(async () => 'commit')
    const actor = startEoaRegistration({ generateCommitment, submitCommitment })

    await waitFor(actor, (s) => s.matches('error'))
    actor.send({ type: 'RETRY' })
    await waitFor(actor, () => submitCommitment.mock.calls.length === 2)

    expect(
      submitCommitment.mock.calls.map(([{ input }]) => input.commitment),
    ).toEqual([{ commitment: '0x01' }, { commitment: '0x02' }])
  })

  it('still verifies an HCA commit on-chain, which can land after a failure', async () => {
    const { actor } = startHcaRegistration({
      balances: [BUDGET],
      submitFundingAndCommit: vi.fn(async () => ({
        resolverAddress: HCA,
        commitment: {},
        txId: 'commit',
      })),
      pollTransactionStatus: vi.fn(async () => {
        throw sendFailed
      }),
      validateCommitment: vi.fn(() => new Promise(() => {})),
    })

    await waitFor(actor, (s) => s.matches('validatingCommitment'))
  })
})

/**
 * Drive the machine to `verifyingRegistration` with a stubbed verifier, so the
 * assertions are about what the machine does with the verdict.
 */
const startVerifyingRegistration = (options: {
  signerType: 'eoa' | 'rhinestone'
  verifyRegistration: ReturnType<typeof vi.fn>
}) => {
  const actor = createActor(
    registrationMachine.provide({
      actors: {
        verifyRegistration: fromPromise(options.verifyRegistration) as never,
        validateCommitment: fromPromise(() => new Promise(() => {})) as never,
      },
    }),
    { input: { chainId: sepolia.id } },
  )

  actor.start()
  actor.send({
    type: 'RESUME',
    stage: 'waitingForRhinestoneBundle',
    context: {
      chainId: sepolia.id,
      name: 'myname.eth',
      duration: 31_536_000n,
      selectedToken: 'USDC',
      tokenPrice: 5_000_000n,
      signerType: options.signerType,
      accountAddress: HCA,
      ownerAddress: WALLET,
      resolverAddress: RESOLVER,
      commitment: { commitment: COMMITMENT, secret: SECRET },
      registrationTxId: 'tx-reg-register',
    },
    deps: {
      signer: { type: options.signerType } as unknown as Signer,
      publicClient: { chain: sepolia } as unknown as PublicClient,
    },
  })

  return actor
}

describe('registrationMachine — RESUME', () => {
  it('routes a stored commitment straight to on-chain validation', async () => {
    const validateCommitment = vi.fn(() => new Promise(() => {}))
    const submitFundingAndCommit = vi.fn(() => new Promise(() => {}))
    const actor = createActor(
      registrationMachine.provide({
        actors: {
          validateCommitment: fromPromise(validateCommitment) as never,
          submitFundingAndCommit: fromPromise(submitFundingAndCommit) as never,
        },
      }),
      { input: { chainId: sepolia.id } },
    )

    actor.start()
    actor.send({
      type: 'RESUME',
      stage: 'commitmentCooldown',
      context: {
        chainId: sepolia.id,
        name: 'myname.eth',
        duration: 31_536_000n,
        selectedToken: 'USDC',
        tokenPrice: 5_000_000n,
        signerType: 'rhinestone',
        accountAddress: HCA,
        ownerAddress: WALLET,
        resolverAddress: RESOLVER,
        commitment: { commitment: COMMITMENT, secret: SECRET },
        commitmentTxId: 'tx-reg-commit',
        registerReadyTimestamp: 1_800_000_000_000,
      },
      deps: {
        signer: { type: 'rhinestone' } as unknown as Signer,
        publicClient: { chain: sepolia } as unknown as PublicClient,
        hcaSessionEnable: SESSION_ENABLE,
      },
    })

    await waitFor(actor, (s) => s.matches('validatingCommitment'))

    // The whole point: no second commit for a commitment already on-chain.
    expect(submitFundingAndCommit).not.toHaveBeenCalled()

    // The secret and the resolver are unguessable and unrecoverable — a resume
    // that loses either has to restart and re-pay.
    const context = actor.getSnapshot().context
    expect(context.commitment).toEqual({
      commitment: COMMITMENT,
      secret: SECRET,
    })
    expect(context.resolverAddress).toBe(RESOLVER)
    expect(context.registerReadyTimestamp).toBe(1_800_000_000_000)

    // Runtime deps come from the event, never from storage.
    expect(context.signer?.type).toBe('rhinestone')
    expect(context.hcaSessionEnable).toEqual(SESSION_ENABLE)

    // A permit past its 1h deadline is worse than no permit: the states that
    // consume it treat "present" as "valid".
    expect(context.permit).toBeUndefined()
    expect(context.hcaBudget).toBeUndefined()
    actor.stop()
  })

  it('waits out the commitment age in the cooldown, where it shows', async () => {
    // Stored before `fetchingCommitmentAge` ran, so the record has no ready
    // time. Validation supplies it; the cooldown, which the apps render as a
    // countdown, does the waiting.
    const readyAt = Date.now() + 42_000
    const waitAfterCommitment = vi.fn(
      (_args: { input: { targetMs: number } }) => new Promise(() => {}),
    )
    const actor = createActor(
      registrationMachine.provide({
        actors: {
          validateCommitment: fromPromise(async () => ({
            registerReadyTimestamp: readyAt,
          })) as never,
          waitAfterCommitment: fromPromise(waitAfterCommitment) as never,
        },
      }),
      { input: { chainId: sepolia.id } },
    )

    actor.start()
    actor.send({
      type: 'RESUME',
      stage: 'waitingForCommitment',
      context: {
        chainId: sepolia.id,
        name: 'myname.eth',
        duration: 31_536_000n,
        selectedToken: 'USDC',
        tokenPrice: 5_000_000n,
        signerType: 'rhinestone',
        accountAddress: HCA,
        ownerAddress: WALLET,
        resolverAddress: RESOLVER,
        commitment: { commitment: COMMITMENT, secret: SECRET },
        commitmentTxId: 'tx-reg-commit',
      },
      deps: {
        signer: { type: 'rhinestone' } as unknown as Signer,
        publicClient: { chain: sepolia } as unknown as PublicClient,
        hcaSessionEnable: SESSION_ENABLE,
      },
    })

    await waitFor(actor, (s) => s.matches('commitmentCooldown'))

    expect(actor.getSnapshot().context.registerReadyTimestamp).toBe(readyAt)
    expect(waitAfterCommitment).toHaveBeenCalledWith(
      expect.objectContaining({ input: { targetMs: readyAt } }),
    )
    actor.stop()
  })

  it('restarts a pre-commit run from setup', async () => {
    const estimateHcaBudget = vi.fn(() => new Promise(() => {}))
    const actor = createActor(
      registrationMachine.provide({
        actors: {
          estimateHcaBudget: fromPromise(estimateHcaBudget) as never,
        },
      }),
      { input: { chainId: sepolia.id } },
    )

    actor.start()
    actor.send({
      type: 'RESUME',
      stage: 'signingFundingPermit',
      context: {
        chainId: sepolia.id,
        name: 'myname.eth',
        duration: 31_536_000n,
        selectedToken: 'USDC',
        tokenPrice: 5_000_000n,
        signerType: 'rhinestone',
        accountAddress: HCA,
        ownerAddress: WALLET,
      },
      deps: {
        signer: { type: 'rhinestone' } as unknown as Signer,
        publicClient: { chain: sepolia } as unknown as PublicClient,
      },
    })

    // Never back into `signingFundingPermit`: it re-prompts the wallet for a
    // permit whose predecessor may already be inside an in-flight bundle.
    await waitFor(actor, (s) => s.matches('computingHcaBudget'))
    expect(actor.getSnapshot().value).toBe('computingHcaBudget')
    actor.stop()
  })

  it('is ignored outside idle, so a live run cannot be rewound', async () => {
    const { actor } = startHcaRegistration({
      balances: [0n],
      // Park here so the assertion is about RESUME, not about how far the
      // funding path happened to run.
      signFundingPermit: vi.fn(() => new Promise(() => {})),
    })
    await waitFor(actor, (s) => s.matches('signingFundingPermit'))

    actor.send({
      type: 'RESUME',
      stage: 'commitmentCooldown',
      context: {
        chainId: sepolia.id,
        name: 'other.eth',
        duration: 31_536_000n,
        selectedToken: 'USDC',
        tokenPrice: 5_000_000n,
        signerType: 'rhinestone',
        commitment: { commitment: COMMITMENT, secret: SECRET },
      },
      deps: {
        signer: { type: 'rhinestone' } as unknown as Signer,
        publicClient: { chain: sepolia } as unknown as PublicClient,
      },
    })

    expect(actor.getSnapshot().value).toBe('signingFundingPermit')
    expect(actor.getSnapshot().context.name).toBe('myname.eth')
    actor.stop()
  })

  it('threads the persisted intent id and status fetcher into verification', async () => {
    const verifyRegistration = vi.fn(() => new Promise(() => {}))
    const fetchIntentStatus = vi.fn(async () => 'PENDING')
    const actor = createActor(
      registrationMachine.provide({
        actors: {
          verifyRegistration: fromPromise(verifyRegistration) as never,
        },
      }),
      { input: { chainId: sepolia.id } },
    )

    actor.start()
    actor.send({
      type: 'RESUME',
      stage: 'waitingForRhinestoneBundle',
      context: {
        chainId: sepolia.id,
        name: 'myname.eth',
        duration: 31_536_000n,
        selectedToken: 'USDC',
        tokenPrice: 5_000_000n,
        signerType: 'rhinestone',
        accountAddress: HCA,
        ownerAddress: WALLET,
        resolverAddress: RESOLVER,
        commitment: { commitment: COMMITMENT, secret: SECRET },
        registrationTxId: 'tx-reg-register',
        registrationIntentId: 42n,
      },
      deps: {
        signer: { type: 'rhinestone' } as unknown as Signer,
        publicClient: { chain: sepolia } as unknown as PublicClient,
        fetchIntentStatus,
      },
    })

    await waitFor(actor, (s) => s.matches('verifyingRegistration'))

    // The whole point of persisting the id: verification can ask the
    // orchestrator about THIS intent instead of blind-polling the registry.
    expect(verifyRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          intentId: 42n,
          fetchIntentStatus,
        }),
      }),
    )
    actor.stop()
  })
})

describe('registrationMachine — SUSPEND', () => {
  it('stops a live run and leaves it ready to RESUME', async () => {
    const { actor } = startHcaRegistration({
      balances: [0n],
      signFundingPermit: vi.fn(() => new Promise(() => {})),
    })
    await waitFor(actor, (s) => s.matches('signingFundingPermit'))

    actor.send({ type: 'SUSPEND' })

    expect(actor.getSnapshot().value).toBe('idle')
    expect(actor.getSnapshot().context.suspended).toBe(true)

    // The owner reconnecting later resumes the same run from idle.
    actor.send({
      type: 'RESUME',
      stage: 'signingFundingPermit',
      context: {
        chainId: sepolia.id,
        name: 'myname.eth',
        duration: 31_536_000n,
        selectedToken: 'USDC',
        tokenPrice: 5_000_000n,
        signerType: 'rhinestone',
        accountAddress: HCA,
        ownerAddress: WALLET,
      },
      deps: {
        signer: { type: 'rhinestone' } as unknown as Signer,
        publicClient: { chain: sepolia } as unknown as PublicClient,
      },
    })

    expect(actor.getSnapshot().value).not.toBe('idle')
    expect(actor.getSnapshot().context.suspended).toBeUndefined()
    actor.stop()
  })
})

describe('registrationMachine — commit receipt failure', () => {
  /** Walk the EOA path up to the commit receipt, which fails with `pollError`. */
  const startEoaCommit = (pollError: Error) => {
    const validateCommitment = vi.fn(() => new Promise(() => {}))
    const actor = createActor(
      registrationMachine.provide({
        actors: {
          // The wallet registered before, so its resolver is already there.
          checkResolverDeployment: fromPromise(async () => ({
            resolverAddress: RESOLVER,
            deployed: true,
          })) as never,
          generateCommitment: fromPromise(async () => ({
            commitment: COMMITMENT,
            secret: SECRET,
          })) as never,
          submitCommitment: fromPromise(async () => 'tx-reg-commit') as never,
          pollTransactionStatus: fromPromise(async () => {
            throw pollError
          }) as never,
          validateCommitment: fromPromise(validateCommitment) as never,
        },
      }),
      { input: { chainId: sepolia.id } },
    )

    actor.start()
    actor.send({
      type: 'START_REGISTRATION',
      name: 'myname.eth',
      duration: 31_536_000n,
      token: 'USDC',
      price: 5_000_000n,
      signer: { type: 'eoa' } as unknown as Signer,
      accountAddress: WALLET,
      ownerAddress: WALLET,
      publicClient: { chain: sepolia } as unknown as PublicClient,
    })

    return { actor, validateCommitment }
  }

  it('goes straight to error when the user declined the commit', async () => {
    const declined = new TransactionUserRejectedError({} as TransactionRequest)
    const { actor, validateCommitment } = startEoaCommit(declined)

    await waitFor(actor, (s) => s.matches('error'))

    // Nothing reached the chain, so there is nothing to wait out retries for.
    expect(validateCommitment).not.toHaveBeenCalled()
    // Kept rather than replaced by "commitment not found": it is how
    // persistence tells a declined run from an interrupted one.
    expect(actor.getSnapshot().context.error).toBe(declined)
    // Retry re-enters through commitment generation (fresh secret) — the one
    // EOA commit-retry path, whether or not the declined commit was sent.
    expect(actor.getSnapshot().context.retryTarget).toBe('preparingCommitment')
    actor.stop()
  })

  it('still verifies on-chain when the receipt poll merely failed', async () => {
    // The commit may have landed; resubmitting it would be rejected by the
    // registrar and strand the user.
    const { actor, validateCommitment } = startEoaCommit(
      new Error('receipt timeout'),
    )

    await waitFor(actor, (s) => s.matches('validatingCommitment'))

    expect(validateCommitment).toHaveBeenCalledOnce()
    actor.stop()
  })
})

describe('registrationMachine — intent id capture', () => {
  it('captures the id the transport reports mid-flight, from any state', () => {
    // `onIntentSubmitted` fires from the transport once the orchestrator
    // accepts the reveal intent — usually after the submitting state has
    // already moved on, which is why the handler lives at the machine root.
    const actor = createActor(registrationMachine, {
      input: { chainId: sepolia.id },
    })

    actor.start()
    actor.send({ type: 'INTENT_SUBMITTED', intentId: 987n })

    expect(actor.getSnapshot().context.registrationIntentId).toBe(987n)
    actor.stop()
  })

  it('clears the dead intent id when retrying the reveal', async () => {
    // Retrying leaves the OLD intent definitively dead. Until the new submit
    // reports its own id via INTENT_SUBMITTED, verification (and the persisted
    // record) must not be able to ask the orchestrator about the old one — a
    // FAILED answer there would skip the grace poll and declare the retried
    // registration dead while its intent is still filling.
    const actor = createActor(
      registrationMachine.provide({
        actors: {
          verifyRegistration: fromPromise(async () => ({
            verified: false,
          })) as never,
          submitRevealBatch: fromPromise(
            () => new Promise(() => {}),
          ) as never /* park: the assertion is about entry context */,
        },
      }),
      { input: { chainId: sepolia.id } },
    )

    actor.start()
    actor.send({
      type: 'RESUME',
      stage: 'waitingForRhinestoneBundle',
      context: {
        chainId: sepolia.id,
        name: 'myname.eth',
        duration: 31_536_000n,
        selectedToken: 'USDC',
        tokenPrice: 5_000_000n,
        signerType: 'rhinestone',
        accountAddress: HCA,
        ownerAddress: WALLET,
        resolverAddress: RESOLVER,
        commitment: { commitment: COMMITMENT, secret: SECRET },
        registrationTxId: 'tx-reg-register',
        registrationIntentId: 42n,
      },
      deps: {
        signer: { type: 'rhinestone' } as unknown as Signer,
        publicClient: { chain: sepolia } as unknown as PublicClient,
      },
    })

    await waitFor(actor, (s) => s.matches('error'))
    expect(actor.getSnapshot().context.retryTarget).toBe(
      'submittingRhinestoneBundle',
    )

    actor.send({ type: 'RETRY' })
    await waitFor(actor, (s) => s.matches('submittingRhinestoneBundle'))

    expect(actor.getSnapshot().context.registrationIntentId).toBeUndefined()
    actor.stop()
  })

  // QA hit this: the orchestrator rejected the reveal, and the screen reported
  // "label is not REGISTERED (status 0)" — true, but it names no cause, and it
  // reads as if the name were the problem rather than the rejected intent.
  it('keeps the orchestrator reason when the reveal never landed', async () => {
    const rejected = new Error(
      'Failed to submit transaction: Intent failed (errorType=Unknown)',
    )
    const actor = createActor(
      registrationMachine.provide({
        actors: {
          validateCommitment: fromPromise(async () => ({
            registerReadyTimestamp: 1_800_000_000_000,
          })) as never,
          waitAfterCommitment: fromPromise(async () => undefined) as never,
          submitRevealBatch: fromPromise(
            async () => 'tx-reg-register',
          ) as never,
          pollTransactionStatus: fromPromise(async () => {
            throw rejected
          }) as never,
          verifyRegistration: fromPromise(async () => ({
            verified: false,
            registeredToOther: false,
            reason: 'label is not REGISTERED (status 0)',
          })) as never,
        },
      }),
      { input: { chainId: sepolia.id } },
    )

    actor.start()
    actor.send({
      type: 'RESUME',
      stage: 'commitmentCooldown',
      context: {
        chainId: sepolia.id,
        name: 'malak.eth',
        duration: 31_536_000n,
        selectedToken: 'USDC',
        tokenPrice: 5_000_000n,
        signerType: 'rhinestone',
        accountAddress: HCA,
        ownerAddress: WALLET,
        resolverAddress: RESOLVER,
        commitment: { commitment: COMMITMENT, secret: SECRET },
        commitmentTxId: 'tx-reg-commit',
        registerReadyTimestamp: 1_800_000_000_000,
      },
      deps: {
        signer: { type: 'rhinestone' } as unknown as Signer,
        publicClient: { chain: sepolia } as unknown as PublicClient,
        hcaSessionEnable: SESSION_ENABLE,
      },
    })

    await waitFor(actor, (s) => s.matches('error'))

    const { context } = actor.getSnapshot()
    expect(context.error).toBe(rejected)
    expect(context.error?.message).not.toContain('not REGISTERED')
    // Still retryable: the name is free, the intent just has to go again.
    expect(context.nameUnavailable).toBeUndefined()
    actor.stop()
  })

  it('stores the status fetcher on a live run, not just on resume', () => {
    // A live run whose reveal intent dies should fail verification in one
    // orchestrator read, same as a resumed one — not sit out the blind poll.
    const fetchIntentStatus = vi.fn(async () => 'PENDING')
    const { actor } = startHcaRegistration({ fetchIntentStatus })

    expect(actor.getSnapshot().context.fetchRegistrationIntentStatus).toBe(
      fetchIntentStatus,
    )
    actor.stop()
  })
})

describe('registrationMachine — verification retry target (WEB-1209)', () => {
  it('sends a rhinestone run back to the reveal batch, not a bare register', async () => {
    // A bare `register` on the HCA path fails: there is no permit in hand, so
    // the allowance is 0. The reveal batch re-reads the price and re-approves.
    const actor = startVerifyingRegistration({
      signerType: 'rhinestone',
      verifyRegistration: vi.fn(async () => ({ verified: false })),
    })

    await waitFor(actor, (s) => s.matches('error'))
    expect(actor.getSnapshot().context.retryTarget).toBe(
      'submittingRhinestoneBundle',
    )
    actor.stop()
  })

  it('sends an EOA run back to register', async () => {
    const actor = startVerifyingRegistration({
      signerType: 'eoa',
      verifyRegistration: vi.fn(async () => ({ verified: false })),
    })

    await waitFor(actor, (s) => s.matches('error'))
    expect(actor.getSnapshot().context.retryTarget).toBe('registeringDomain')
    actor.stop()
  })

  it('is signer-aware when the verification read itself fails', async () => {
    const actor = startVerifyingRegistration({
      signerType: 'rhinestone',
      verifyRegistration: vi.fn(async () => {
        throw new Error('rpc down')
      }),
    })

    await waitFor(actor, (s) => s.matches('error'))
    expect(actor.getSnapshot().context.retryTarget).toBe(
      'submittingRhinestoneBundle',
    )
    actor.stop()
  })

  it('reaches success when the name is on-chain', async () => {
    const actor = startVerifyingRegistration({
      signerType: 'rhinestone',
      verifyRegistration: vi.fn(async () => ({ verified: true })),
    })

    await waitFor(actor, (s) => s.matches('success'))
    expect(actor.getSnapshot().context.error).toBeUndefined()
    actor.stop()
  })
})
