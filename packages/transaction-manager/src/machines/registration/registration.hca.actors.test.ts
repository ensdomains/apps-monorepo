// biome-ignore-all lint/suspicious/noExplicitAny: decoded ABI args need flexible typing in tests

import {
  computeResolverAddress,
  getDestinationContracts,
  HCA_ADDR_REVERSE_CLEAR_GAS,
  primaryNameGas,
} from '@ens-apps/smart-account'
import type { Address, Hex, PublicClient } from 'viem'
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodePacked,
  hashTypedData,
  isAddressEqual,
  keccak256,
  parseAbi,
  parseAbiParameters,
  zeroAddress,
} from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  EOASigner,
  L2FundingSource,
  RhinestoneSigner,
  Signer,
} from '../../types/signer.types'
import type { RhinestoneTransactionRequest } from '../../types/transaction.types'
import type { PermitSignature } from './registration.actors'
import {
  awaitL2BridgeActor,
  estimateHcaBudgetActor,
  readHcaUsdcBalanceAtLeastActor,
  readUsdcSpend,
  rejectPermitValue,
  signDaiFundingPermitActor,
  signFundingPermitActor,
  submitFundingAndCommitActor,
  submitL2BridgeActor,
  submitRevealBatchActor,
  verifyHcaRegistrationActor,
} from './registration.hca.actors'

const startTransaction = vi.fn(() => 'tx-1')
vi.mock('../../providers/transactionManager', () => ({
  transactionManager: {
    startTransaction: (...args: unknown[]) =>
      (startTransaction as unknown as (...a: unknown[]) => string)(...args),
  },
}))

const readContract = vi.fn()
const signTypedData = vi.fn()
const getEip712Domain = vi.fn()
vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  readContract: (...args: unknown[]) => readContract(...args),
  signTypedData: (...args: unknown[]) => signTypedData(...args),
  getEip712Domain: (...args: unknown[]) => getEip712Domain(...args),
}))

const C = getDestinationContracts(sepolia.id)

const WALLET = '0x1111111111111111111111111111111111111111' as Address
const HCA = '0xaaaa000000000000000000000000000000000001' as Address
const RESOLVER_WITH_RECORD =
  '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5' as Address
const SESSION_KEY = '0x9999999999999999999999999999999999999999' as Address
const COMMITMENT = `0x${'cc'.repeat(32)}` as Hex

const erc20Abi = parseAbi([
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
])

const permit: PermitSignature = {
  owner: WALLET,
  spender: HCA,
  value: 15_000_000n,
  deadline: 1_800_000_000n,
  v: 27,
  r: `0x${'11'.repeat(32)}` as Hex,
  s: `0x${'22'.repeat(32)}` as Hex,
}

const sessionEnable = {
  enableData: { some: 'enable-data' } as never,
  permissionId: `0x${'ab'.repeat(32)}` as Hex,
  sessionKey: SESSION_KEY,
  validUntil: 1_800_000_000n,
}

/** `makeCommitment` is the only read `submitFundingAndCommitActor` makes. */
const commitClient = {
  chain: sepolia,
  readContract: vi.fn().mockResolvedValue(COMMITMENT),
} as unknown as PublicClient

const rhinestoneSigner = { type: 'rhinestone' } as unknown as Signer

const submittedRequest = (): RhinestoneTransactionRequest => {
  const [intent] = startTransaction.mock.calls[0] as unknown as [
    { request: RhinestoneTransactionRequest },
  ]
  return intent.request
}

beforeEach(() => {
  vi.clearAllMocks()
  // `mockClear` keeps queued `...Once` values, so reset the contract reads
  // explicitly — every test queues its own sequence.
  readContract.mockReset()
  getEip712Domain.mockReset()
})

describe('submitFundingAndCommitActor', () => {
  const input = {
    name: 'myname.eth',
    wallet: WALLET,
    hca: HCA,
    duration: 31_536_000n,
    signer: rhinestoneSigner,
    publicClient: commitClient,
  }

  it('bundles funding and the commit into one user-paid request', async () => {
    const result = await submitFundingAndCommitActor({
      ...input,
      referrer: '0x1234',
      permit,
      sessionEnable,
    })

    expect(result.isOk()).toBe(true)
    expect(commitClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'makeCommitment',
        args: expect.arrayContaining([`0x${'0'.repeat(60)}1234`]),
      }),
    )
    const request = submittedRequest()
    const calls = request.rhinestoneParams.calls

    // permit → transferFrom → commit. No call to the validator: it is
    // stateless, and its policy rejects any execution that targets it.
    expect(calls.map((c) => c.to.toLowerCase())).toEqual([
      C.usdc.toLowerCase(),
      C.usdc.toLowerCase(),
      C.ethRegistrar.toLowerCase(),
    ])
    expect(
      calls.some((c) => isAddressEqual(c.to, C.hcaOwnerAndSessionValidator)),
    ).toBe(false)

    // The permit pulls exactly the permitted budget into the HCA.
    const transfer = decodeFunctionData({ abi: erc20Abi, data: calls[1].data })
    expect(transfer.functionName).toBe('transferFrom')
    expect((transfer.args as any)[0].toLowerCase()).toBe(WALLET.toLowerCase())
    expect((transfer.args as any)[1].toLowerCase()).toBe(HCA.toLowerCase())
    expect((transfer.args as any)[2]).toBe(permit.value)

    // Paid by the HCA in USDC. Sponsorship is not a request-level concern at
    // all any more — the transport always sends the user-paid shape.
    expect(request.from.toLowerCase()).toBe(HCA.toLowerCase())
    expect(request.rhinestoneParams.feeAsset).toBe('USDC')
    // The session authorization rides along with the intent.
    expect(request.rhinestoneParams.sessionEnableData).toBe(
      sessionEnable.enableData,
    )
  })

  it('declares the permit inflow as auxiliary funds so the intent can be planned', async () => {
    // The HCA's USDC arrives DURING the intent (permit → transferFrom), so the
    // planner cannot see it when it decides whether a route exists. Left
    // undeclared it rejects the intent outright with NO_PLAN_AVAILABLE /
    // SAME_CHAIN_INTENT_NOT_APPLICABLE.
    const result = await submitFundingAndCommitActor({
      ...input,
      permit,
      sessionEnable,
    })

    expect(result.isOk()).toBe(true)
    expect(submittedRequest().rhinestoneParams.auxiliaryFunds).toEqual({
      [sepolia.id]: { [C.usdc]: permit.value },
    })
  })

  it('submits the commit alone once the HCA is funded', async () => {
    const result = await submitFundingAndCommitActor(input)

    expect(result.isOk()).toBe(true)
    const request = submittedRequest()
    expect(request.rhinestoneParams.calls).toHaveLength(1)
    expect(request.rhinestoneParams.calls[0].to.toLowerCase()).toBe(
      C.ethRegistrar.toLowerCase(),
    )
    expect(request.rhinestoneParams.sessionEnableData).toBeUndefined()
    // Nothing flows in on this path, so there is nothing to declare —
    // over-declaring would inflate the planner's view and the quote with it.
    expect(request.rhinestoneParams.auxiliaryFunds).toBeUndefined()
  })

  it('returns the commitment so the reveal can rebind to the same secret', async () => {
    const result = await submitFundingAndCommitActor(input)

    expect(result._unsafeUnwrap().commitment.commitment).toBe(COMMITMENT)
    // A fresh 32-byte secret per attempt.
    expect(result._unsafeUnwrap().commitment.secret).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it.each([
    ['a fullwidth look-alike', 'ｍｙｎａｍｅ.eth', /Refusing to register/],
    ['a soft hyphen', 'my­name.eth', /Refusing to register/],
    [
      'a stray variation selector',
      'thumbs\u{1f44d}️.eth',
      /Refusing to register/,
    ],
    ['an upper-case label', 'MYNAME.eth', /Refusing to register/],
    ['an xn-- extension', 'xn--ls8h.eth', /invalid label extension/],
  ])(
    'refuses to commit to %s rather than sign a different name',
    async (_case, name, message) => {
      // The commitment binds `keccak256(label)`, so a label that is not already
      // canonical buys a name no ENSIP-15 client can resolve — and one the app's
      // own read path cannot address. The flow canonicalises at its entry; this
      // is the last check before the wallet.
      const result = await submitFundingAndCommitActor({ ...input, name })

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toMatch(message)
      expect(startTransaction).not.toHaveBeenCalled()
    },
  )
})

describe('submitL2BridgeActor', () => {
  const source = {
    chain: { id: 84532, name: 'Base Sepolia' },
  } as unknown as L2FundingSource
  const hcaSigner = {
    type: 'rhinestone',
    account: { id: 'hca' },
    config: { chain: sepolia },
    session: { session: {} },
  } as unknown as RhinestoneSigner
  const publicClient = { chain: sepolia } as unknown as PublicClient

  it('has the wallet deliver the shortfall to the HCA there, running nothing on Sepolia', async () => {
    const onIntentSubmitted = vi.fn()
    const result = await submitL2BridgeActor({
      hca: HCA,
      payment: { source, amount: 15_000_000n, displayedCharge: 15_050_000n },
      signer: hcaSigner,
      publicClient,
      onIntentSubmitted,
    })

    expect(result.isOk()).toBe(true)
    const request = submittedRequest()
    // Across runs an intent's calls from its own handler, so the legs stay
    // with the HCA and this only delivers.
    expect(request.rhinestoneParams.calls).toEqual([])
    expect(request.rhinestoneParams.tokenRequests).toEqual([
      { address: C.usdc, amount: 15_000_000n },
    ])
    expect(request.rhinestoneParams.sessionEnableData).toBeUndefined()
    // Its id is what a retry or a resumed run settles before paying again.
    expect(request.rhinestoneParams.onIntentSubmitted).toBe(onIntentSubmitted)

    const [, signer, options] = startTransaction.mock.calls[0] as unknown as [
      unknown,
      RhinestoneSigner,
      { retryCount?: number },
    ]
    // Signed by the wallet on the L2, so no session goes with it.
    expect(signer).toEqual({
      type: 'rhinestone',
      account: hcaSigner.account,
      config: hcaSigner.config,
      l2Funding: source,
      // The transport holds the fresh quote's charge to this.
      l2DisplayedCharge: 15_050_000n,
    })
    // A resend would ask the wallet to sign a second payment.
    expect(options.retryCount).toBe(0)
  })

  it('refuses an amount above what checkout showed, before the wallet is asked', async () => {
    const result = await submitL2BridgeActor({
      hca: HCA,
      payment: {
        source,
        amount: 20_000_000n,
        bounds: { displayedValue: 15_000_000n },
      },
      signer: hcaSigner,
      publicClient,
    })

    expect(result._unsafeUnwrapErr().message).toMatch(
      /Refusing to request a signature/,
    )
    expect(startTransaction).not.toHaveBeenCalled()
  })
})

describe('awaitL2BridgeActor', () => {
  const run = (
    statuses: (string | null)[],
    timeoutMs = 1_000,
    claimableUntil = 0,
  ) => {
    const fetchIntentStatus = vi.fn(async () => statuses.shift() ?? null)
    return {
      fetchIntentStatus,
      result: awaitL2BridgeActor({
        intentId: 9n,
        claimableUntil,
        fetchIntentStatus,
        pollIntervalMs: 0,
        timeoutMs,
      }),
    }
  }

  // A lost submission is never known to the orchestrator; one it holds is.
  it('reports a bridge still unknown once its permit lapsed as dead', async () => {
    const { result } = run(['NOT_FOUND'])

    expect((await result)._unsafeUnwrap()).toBe('dead')
  })

  // Its answer may have been lost, but the permit can still be claimed.
  it('keeps waiting on an unknown bridge while its permit is claimable', async () => {
    const { fetchIntentStatus, result } = run(
      Array(5).fill('NOT_FOUND'),
      20,
      Date.now() + 60_000,
    )

    expect((await result).isErr()).toBe(true)
    expect(fetchIntentStatus.mock.calls.length).toBeGreaterThan(1)
  })

  it('keeps waiting on a bridge the orchestrator comes to know', async () => {
    const { result } = run(
      ['NOT_FOUND', 'PENDING', 'COMPLETED'],
      1_000,
      Date.now() + 60_000,
    )

    expect((await result)._unsafeUnwrap()).toBe('landed')
  })

  it('waits through pending until the bridge fills', async () => {
    const { fetchIntentStatus, result } = run([null, 'PENDING', 'COMPLETED'])

    expect((await result)._unsafeUnwrap()).toBe('landed')
    expect(fetchIntentStatus).toHaveBeenCalledTimes(3)
    expect(fetchIntentStatus).toHaveBeenCalledWith(9n, undefined)
  })

  it('reports a failed or expired bridge as dead', async () => {
    expect((await run(['FAILED']).result)._unsafeUnwrap()).toBe('dead')
    expect((await run(['EXPIRED']).result)._unsafeUnwrap()).toBe('dead')
  })

  // An unconfirmed payment must never be followed by a second one.
  it('fails rather than settling when the status never resolves', async () => {
    const { result } = run([], 20)

    expect((await result).isErr()).toBe(true)
  })

  it('fails without a status lookup', async () => {
    const result = await awaitL2BridgeActor({ intentId: 9n, claimableUntil: 0 })

    expect(result.isErr()).toBe(true)
  })
})

describe('readHcaUsdcBalanceAtLeastActor', () => {
  const run = (balances: (bigint | Error)[], timeoutMs = 1_000) => {
    readContract.mockImplementation(async () => {
      const next = balances.length > 1 ? balances.shift() : balances[0]
      if (next instanceof Error) throw next
      return next
    })
    return readHcaUsdcBalanceAtLeastActor({
      hca: HCA,
      publicClient: { chain: sepolia } as unknown as PublicClient,
      chainId: sepolia.id,
      atLeast: 10n,
      pollIntervalMs: 0,
      timeoutMs,
    })
  }

  // A lagging node still reads the balance from before the bridge landed.
  it('reads again until the balance shows the bridge', async () => {
    const result = await run([0n, new Error('rpc'), 12n])

    expect(result._unsafeUnwrap()).toBe(12n)
    expect(readContract).toHaveBeenCalledTimes(3)
  })

  it('settles for the last read once it gives up', async () => {
    const result = await run([4n], 20)

    expect(result._unsafeUnwrap()).toBe(4n)
  })

  it('fails when no read ever succeeds', async () => {
    const result = await run([new Error('rpc')], 20)

    expect(result.isErr()).toBe(true)
  })
})

describe('submitRevealBatchActor', () => {
  // The validator keeps no session state, so the reveal is rejected
  // (InvalidSessionData, surfaced as UnclassifiedRevert) unless it carries the
  // same authorization as the commit.
  it('signs the reveal with the session authorization', async () => {
    const revealClient = {
      chain: sepolia,
      readContract: vi.fn().mockResolvedValue([5_000_000n, 0n]),
      getCode: vi.fn().mockResolvedValue('0x'),
    } as unknown as PublicClient

    const result = await submitRevealBatchActor({
      name: 'myname.eth',
      wallet: WALLET,
      hca: HCA,
      duration: 31_536_000n,
      secret: `0x${'dd'.repeat(32)}` as Hex,
      referrer: '0x1234',
      sessionEnable,
      signer: rhinestoneSigner,
      publicClient: revealClient,
    })

    expect(result.isOk()).toBe(true)
    expect(submittedRequest().rhinestoneParams.sessionEnableData).toBe(
      sessionEnable.enableData,
    )
    const register = submittedRequest().rhinestoneParams.calls.find(
      (call) => call.to === C.ethRegistrar,
    )
    expect(register).toBeDefined()
    if (!register) return
    const decoded = decodeFunctionData({
      abi: parseAbi([
        'function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer)',
      ]),
      data: register.data,
    })
    expect(decoded.args[7]).toBe(`0x${'0'.repeat(60)}1234`)
  })

  // `addr.reverse` outranks the `default.reverse` claim, so a leftover entry
  // is cleared in the same session-signed batch, not by a wallet prompt.
  it.each([
    { label: 'clears', addrReverseResolver: RESOLVER_WITH_RECORD },
    { label: 'leaves', addrReverseResolver: zeroAddress },
  ])(
    '$label addr.reverse per its resolver',
    async ({ addrReverseResolver }) => {
      const revealClient = {
        chain: sepolia,
        readContract: vi.fn(({ functionName }: { functionName: string }) =>
          Promise.resolve(
            functionName === 'resolver'
              ? addrReverseResolver
              : [5_000_000n, 0n],
          ),
        ),
        getCode: vi.fn().mockResolvedValue('0x'),
      } as unknown as PublicClient

      const result = await submitRevealBatchActor({
        name: 'myname.eth',
        wallet: WALLET,
        hca: HCA,
        duration: 31_536_000n,
        secret: `0x${'dd'.repeat(32)}` as Hex,
        sessionEnable,
        signer: rhinestoneSigner,
        publicClient: revealClient,
        primaryName: 'myname.eth',
      })

      expect(result.isOk()).toBe(true)
      const calls = submittedRequest().rhinestoneParams.calls
      const claim = calls.find((call) =>
        isAddressEqual(call.to, C.reverseRegistrarHcaAdapter),
      )
      if (addrReverseResolver === zeroAddress) {
        expect(claim).toBeUndefined()
        return
      }
      // Last, after setNameWithHCA, for the wallet with resolver 0.
      expect(claim).toBe(calls.at(-1))
      const decoded = decodeFunctionData({
        abi: parseAbi([
          'function claimWithHCA(address addr, address resolver) returns (bytes32)',
        ]),
        // biome-ignore lint/style/noNonNullAssertion: asserted defined above
        data: claim!.data,
      })
      expect(decoded.args).toEqual([WALLET, zeroAddress])
    },
  )
})

describe('verifyHcaRegistrationActor', () => {
  const publicClient = { chain: sepolia } as unknown as PublicClient
  const hcaResolver = computeResolverAddress({ chainId: sepolia.id, hca: HCA })
  const DURATION = 31_536_000n
  const ATTACKER_REGISTRY =
    '0xbadbad0000000000000000000000000000000001' as Address

  const registeredState = (latestOwner: Address, expiry?: bigint) => ({
    status: 2, // IPermissionedRegistry.Status.REGISTERED
    expiry: expiry ?? BigInt(Math.floor(Date.now() / 1000)) + DURATION,
    latestOwner,
    tokenId: 0n,
    resource: 0n,
  })

  /**
   * `getState`, `getResolver`, `getSubregistry`, `commitmentAt` — the order the
   * actor reads them. `commitTime` 0 means our commitment was consumed.
   */
  const mockRegistry = (
    state: unknown,
    resolver: Address,
    subregistry: Address = zeroAddress,
    commitTime: bigint = 0n,
  ) => {
    readContract
      .mockResolvedValueOnce(state)
      .mockResolvedValueOnce(resolver as unknown)
      .mockResolvedValueOnce(subregistry as unknown)
      .mockResolvedValueOnce(commitTime as unknown)
  }

  // `graceWindowMs: 0` pins these to ONE read: they are about how a registry
  // response is interpreted, not about the grace-poll (covered separately in
  // registration.verify-poll.test.ts). Without it, every negative case would
  // re-read for the default 30s.
  const verify = () =>
    verifyHcaRegistrationActor({
      name: 'myname.eth',
      wallet: WALLET,
      hca: HCA,
      publicClient,
      commitment: COMMITMENT,
      duration: DURATION,
      graceWindowMs: 0,
    })

  it('verifies a name owned by the wallet and resolved by the HCA resolver', async () => {
    mockRegistry(registeredState(WALLET), hcaResolver)

    expect((await verify())._unsafeUnwrap().verified).toBe(true)
  })

  it('re-reads until the reveal lands, rather than failing on the first look', async () => {
    // A resumed run reaches verification while the intent is still filling
    // server-side. One read would report a false failure and push the user
    // into a retry for a name they are about to own.
    mockRegistry(registeredState(WALLET), zeroAddress)
    mockRegistry(registeredState(WALLET), hcaResolver)

    const result = await verifyHcaRegistrationActor({
      name: 'myname.eth',
      wallet: WALLET,
      hca: HCA,
      publicClient,
      commitment: COMMITMENT,
      duration: DURATION,
      graceWindowMs: 500,
      pollIntervalMs: 10,
    })

    expect(result._unsafeUnwrap().verified).toBe(true)
    // Four registry reads per poll iteration, two iterations.
    expect(readContract).toHaveBeenCalledTimes(8)
  })

  it('rejects a name whose owner is the HCA instead of the wallet', async () => {
    // The registrar always assigns the name to the wallet; the HCA holding it
    // means the reveal batch registered the wrong owner.
    mockRegistry(registeredState(HCA), hcaResolver)

    expect((await verify())._unsafeUnwrap().verified).toBe(false)
  })

  it('rejects a name pointed at some other resolver', async () => {
    mockRegistry(registeredState(WALLET), WALLET)

    expect((await verify())._unsafeUnwrap().verified).toBe(false)
  })

  it('rejects a registration carrying a subregistry we never set', async () => {
    // An attacker's registration: our wallet as owner, our resolver, but their
    // subregistry — so they own the namespace beneath the name.
    mockRegistry(registeredState(WALLET), hcaResolver, ATTACKER_REGISTRY)

    const { verified, reason } = (await verify())._unsafeUnwrap()
    expect(verified).toBe(false)
    expect(reason).toMatch(/subregistry/i)
  })

  it('rejects a registration that left our commitment unconsumed', async () => {
    // Only we can consume it, so a recorded commitment means somebody else's
    // reveal registered this name — even with every other field matching.
    mockRegistry(registeredState(WALLET), hcaResolver, zeroAddress, 1_700_000n)

    const { verified, reason } = (await verify())._unsafeUnwrap()
    expect(verified).toBe(false)
    expect(reason).toMatch(/commitment/i)
  })

  it('rejects a registration expiring sooner than the duration we paid for', async () => {
    const oneMonth = BigInt(Math.floor(Date.now() / 1000)) + 28n * 86_400n
    mockRegistry(registeredState(WALLET, oneMonth), hcaResolver)

    const { verified, reason } = (await verify())._unsafeUnwrap()
    expect(verified).toBe(false)
    expect(reason).toMatch(/expiry/i)
  })

  it('reports a name registered to another wallet as lost, not merely unverified', async () => {
    // Two people registered the same name; this one lost. Resubmitting the
    // reveal can only fail the same way, so the caller must be able to tell
    // this apart from "not registered yet".
    const rival = '0xbbbb000000000000000000000000000000000002' as Address
    mockRegistry(registeredState(rival), hcaResolver)

    const output = (await verify())._unsafeUnwrap()
    expect(output.verified).toBe(false)
    expect(output.registeredToOther).toBe(true)
  })

  it('does not report an unregistered name as lost', async () => {
    mockRegistry({ ...registeredState(WALLET), status: 0 }, hcaResolver)

    expect((await verify())._unsafeUnwrap().registeredToOther).toBe(false)
  })
})

describe('signFundingPermitActor', () => {
  const publicClient = { chain: sepolia } as unknown as PublicClient

  const eoaSigner = (address: Address): Signer =>
    ({
      type: 'eoa',
      walletClient: { account: { address } },
    }) as unknown as EOASigner

  it('refuses to sign with anything but the wallet EOA', async () => {
    const result = await signFundingPermitActor({
      wallet: WALLET,
      hca: HCA,
      value: 15_000_000n,
      approvalSigner: rhinestoneSigner,
      publicClient,
      chainId: sepolia.id,
    })

    expect(result._unsafeUnwrapErr().message).toMatch(/requires an EOA signer/i)
  })

  it('refuses to sign when the connected account is not the permit owner', async () => {
    const result = await signFundingPermitActor({
      wallet: WALLET,
      hca: HCA,
      value: 15_000_000n,
      approvalSigner: eoaSigner(
        '0xdead00000000000000000000000000000000dead' as Address,
      ),
      publicClient,
      chainId: sepolia.id,
    })

    expect(result._unsafeUnwrapErr().message).toMatch(/does not match/i)
  })

  it('reads the token’s EIP-712 version when eip712Domain() is unavailable', async () => {
    // Circle's Sepolia USDC (FiatTokenV2_2) reverts on ERC-5267 and signs its
    // permits over domain version "2" — assuming "1" produced an invalid
    // signature that reverted the funding leg.
    getEip712Domain.mockRejectedValue(new Error('execution reverted'))
    readContract
      .mockResolvedValueOnce(7n) // nonces(wallet)
      .mockResolvedValueOnce(20_000_000n) // balanceOf(wallet)
      .mockResolvedValueOnce('USDC') // name()
      .mockResolvedValueOnce('2') // version()
    signTypedData.mockResolvedValue(`0x${'11'.repeat(32)}${'22'.repeat(32)}1b`)

    const result = await signFundingPermitActor({
      wallet: WALLET,
      hca: HCA,
      value: 15_000_000n,
      approvalSigner: eoaSigner(WALLET),
      publicClient,
      chainId: sepolia.id,
    })

    expect(result.isOk()).toBe(true)
    const [, typedData] = signTypedData.mock.calls[0] as unknown as [
      unknown,
      { domain: { name: string; version: string }; message: any },
    ]
    expect(typedData.domain.version).toBe('2')
    expect(typedData.domain.name).toBe('USDC')
    // Spender is the HCA (it pays the registrar itself), never the registrar.
    expect(typedData.message.spender.toLowerCase()).toBe(HCA.toLowerCase())
    expect(typedData.message.value).toBe(15_000_000n)
    expect(typedData.message.nonce).toBe(7n)
  })

  it('refuses to sign a permit the wallet cannot cover, without prompting', async () => {
    // Regression: the pricing UI gates on the registration PRICE, but the
    // permit is signed for the whole HCA budget (price + both leg costs). A
    // wallet holding between the two used to sign happily and then have the
    // commit batch revert on `transferFrom`, which the orchestrator reports as
    // `Simulation failed: UnclassifiedRevert` / `errorSelector: 0x00000000` —
    // naming neither USDC nor the shortfall.
    getEip712Domain.mockRejectedValue(new Error('execution reverted'))
    readContract
      .mockResolvedValueOnce(0n) // nonces(wallet)
      .mockResolvedValueOnce(20_000_000n) // balanceOf(wallet) — 20.000000 USDC

    const result = await signFundingPermitActor({
      wallet: WALLET,
      hca: HCA,
      value: 20_196_054n, // 20.196054 USDC budget
      approvalSigner: eoaSigner(WALLET),
      publicClient,
      chainId: sepolia.id,
    })

    expect(result._unsafeUnwrapErr().message).toMatch(
      /Insufficient USDC.*Need 20\.196054 USDC.*holds 20 USDC.*short by 0\.196054 USDC/s,
    )
    // The wallet must never be asked to sign a permit that cannot be honoured.
    expect(signTypedData).not.toHaveBeenCalled()
  })

  it('requests no signature for a value above the expected maximum', async () => {
    // The value traces back to figures the orchestrator returned over HTTP.
    // The maximum is computed from the on-chain price and a fixed margin, so a
    // value above it means the quote cannot be trusted at all.
    const result = await signFundingPermitActor({
      wallet: WALLET,
      hca: HCA,
      value: 40_000_000n,
      approvalSigner: eoaSigner(WALLET),
      publicClient,
      chainId: sepolia.id,
      bounds: { expectedMaximum: 30_000_000n },
    })

    expect(result._unsafeUnwrapErr().message).toMatch(
      /above the expected maximum of 30 USDC/,
    )
    expect(signTypedData).not.toHaveBeenCalled()
    // Refused before the RPC round-trips, so a flaky node cannot mask it.
    expect(readContract).not.toHaveBeenCalled()
  })

  it('requests no signature for a value above what was displayed', async () => {
    const result = await signFundingPermitActor({
      wallet: WALLET,
      hca: HCA,
      value: 20_000_000n,
      approvalSigner: eoaSigner(WALLET),
      publicClient,
      chainId: sepolia.id,
      bounds: { displayedValue: 12_000_000n },
    })

    expect(result._unsafeUnwrapErr().message).toMatch(
      /12 USDC was shown at checkout/,
    )
    expect(signTypedData).not.toHaveBeenCalled()
  })

  it('allows honest gas drift above the displayed figure', async () => {
    // Checkout and the machine take separate quotes up to a minute apart, so
    // the two legitimately disagree. A bound that refused any divergence would
    // break registration whenever gas moved.
    getEip712Domain.mockRejectedValue(new Error('execution reverted'))
    readContract
      .mockResolvedValueOnce(0n) // nonces(wallet)
      .mockResolvedValueOnce(50_000_000n) // balanceOf(wallet)
      .mockResolvedValueOnce('USDC') // name()
      .mockResolvedValueOnce('2') // version()
    signTypedData.mockResolvedValue(`0x${'11'.repeat(32)}${'22'.repeat(32)}1b`)

    const result = await signFundingPermitActor({
      wallet: WALLET,
      hca: HCA,
      value: 12_500_000n, // exactly the 25% allowance over the displayed 10
      approvalSigner: eoaSigner(WALLET),
      publicClient,
      chainId: sepolia.id,
      bounds: { displayedValue: 10_000_000n },
    })

    expect(result.isOk()).toBe(true)
  })

  it('words a refusal in the permitted token and the caller’s purpose', () => {
    // Renewals and other standalone intents reach this too, some in DAI, so
    // neither the units nor "the registration" can be assumed.
    const refusal = rejectPermitValue(
      3n * 10n ** 18n,
      { displayedValue: 2n * 10n ** 18n },
      { symbol: 'DAI', decimals: 18 },
      { subject: 'the renewal', shownAt: 'in the prompt', costNote: '' },
    )

    expect(refusal).toMatch(
      /authorize 3 DAI, but 2 DAI was shown in the prompt/,
    )
    expect(refusal).toMatch(/start the renewal again/)
    expect(refusal).not.toMatch(/registration|USDC/)
  })

  it('never refuses a value BELOW what was displayed', async () => {
    // Being asked to approve less than was quoted has not misled anyone — and
    // a cheaper re-quote is the common case when gas falls.
    expect(
      rejectPermitValue(4_000_000n, { displayedValue: 10_000_000n }),
    ).toBeNull()
  })
})

describe('signDaiFundingPermitActor', () => {
  // Mainnet DAI, with the domain separator and typehash read from the chain.
  const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F' as Address
  const DAI_DOMAIN_SEPARATOR =
    '0xdbb8cf42e1ecb028be3f3dbc922e1d878b963f411dc388ced501601c60f7c6f7'
  const DAI_PERMIT_TYPEHASH =
    '0xea2aa0a1be11a07ed86d755c93467f4f82362b452371d1ba94d1715123511acb'
  const publicClient = { chain: mainnet } as unknown as PublicClient
  const approvalSigner = {
    type: 'eoa',
    walletClient: { account: { address: WALLET } },
  } as unknown as EOASigner

  const sign = () => {
    getEip712Domain.mockRejectedValue(new Error('execution reverted'))
    readContract
      .mockResolvedValueOnce(3n) // nonces(wallet)
      .mockResolvedValueOnce(5n * 10n ** 18n) // balanceOf(wallet)
      .mockResolvedValueOnce('Dai Stablecoin') // name()
      .mockResolvedValueOnce('1') // version()
    signTypedData.mockResolvedValue(`0x${'11'.repeat(32)}${'22'.repeat(32)}1b`)
    return signDaiFundingPermitActor({
      wallet: WALLET,
      hca: HCA,
      value: 2n * 10n ** 18n,
      approvalSigner,
      publicClient,
      chainId: mainnet.id,
      token: {
        address: DAI,
        symbol: 'DAI',
        decimals: 18,
        permitKind: 'dai-legacy',
      },
    })
  }

  it('signs the digest DAI’s own permit recomputes', async () => {
    const signed = (await sign())._unsafeUnwrap()

    const [, typedData] = signTypedData.mock.calls[0] as unknown as [
      unknown,
      Parameters<typeof hashTypedData>[0],
    ]
    // `Dai.permit`: keccak256("\x19\x01" ‖ DOMAIN_SEPARATOR ‖ keccak256(
    //   abi.encode(PERMIT_TYPEHASH, holder, spender, nonce, expiry, allowed)))
    const onChainDigest = keccak256(
      encodePacked(
        ['bytes2', 'bytes32', 'bytes32'],
        [
          '0x1901',
          DAI_DOMAIN_SEPARATOR,
          keccak256(
            encodeAbiParameters(
              parseAbiParameters(
                'bytes32, address, address, uint256, uint256, bool',
              ),
              [DAI_PERMIT_TYPEHASH, WALLET, HCA, 3n, signed.expiry, true],
            ),
          ),
        ],
      ),
    )
    expect(hashTypedData(typedData)).toBe(onChainDigest)
    expect(signed).toMatchObject({
      holder: WALLET,
      spender: HCA,
      nonce: 3n,
      allowed: true,
      v: 27,
    })
  })

  it('signs an absolute expiry, never zero', async () => {
    // DAI reads `expiry == 0` as "never expires".
    const now = BigInt(Math.floor(Date.now() / 1000))
    const { expiry } = (await sign())._unsafeUnwrap()

    expect(expiry).toBeGreaterThan(now)
    expect(expiry).toBeLessThanOrEqual(now + 3600n)
  })
})

describe('readUsdcSpend', () => {
  const usdc = C.usdc

  it('reads the cost from tokensSpent, which is where it actually lives', () => {
    // Shaped after a live orchestrator response for a commit-only same-chain
    // intent (gasCost.totalUSD was 0.9065, matching 905736 6dp). The token key
    // tracks `C.usdc` — the orchestrator echoes it lowercased.
    const cost = {
      tokensSpent: {
        '11155111': {
          [usdc.toLowerCase()]: {
            locked: '0',
            unlocked: '905736',
          },
        },
      },
    }

    expect(readUsdcSpend(cost, sepolia.id)).toBe(905_736n)
  })

  it('matches the token address case-insensitively', () => {
    // The orchestrator echoes addresses lowercased while our contract
    // constants are checksummed. An exact-key lookup misses and silently
    // degrades the budget to the gas fallback.
    expect(usdc).not.toBe(usdc.toLowerCase())

    const cost = {
      tokensSpent: {
        '11155111': {
          [usdc.toLowerCase()]: { locked: '0', unlocked: '12345' },
        },
      },
    }

    expect(readUsdcSpend(cost, sepolia.id)).toBe(12_345n)
  })

  it('sums locked and unlocked, since the account spends both', () => {
    const cost = {
      tokensSpent: {
        '11155111': {
          [usdc.toLowerCase()]: { locked: '1000', unlocked: '2000' },
        },
      },
    }

    expect(readUsdcSpend(cost, sepolia.id)).toBe(3_000n)
  })

  it('returns null rather than 0 when the quote carries no cost for the chain', () => {
    // 0 would be indistinguishable from a free intent and would size a permit
    // at exactly the registration price, leaving nothing for fees.
    expect(readUsdcSpend({ tokensSpent: {} }, sepolia.id)).toBeNull()
    expect(readUsdcSpend(undefined, sepolia.id)).toBeNull()
    expect(
      readUsdcSpend(
        { tokensSpent: { '11155111': { '0xother': { unlocked: '5' } } } },
        sepolia.id,
      ),
    ).toBeNull()
  })

  it('reads 0 when the quote itself prices the intent at nothing', () => {
    // Captured verbatim from the E2E orchestrator, which settles every leg for
    // free: `tokensSpent` is empty not because the quote failed but because
    // there is nothing to spend. Reporting that as unreadable degrades the
    // budget to the fallback, which the no-fallback guard turns into a hard
    // "HCA budget could not be quoted" and fails every registration E2E.
    const freeQuote = {
      tokensSpent: {},
      gasCost: { totalUSD: 0 },
      feeBreakdownUSD: { totalFeeUSD: 0 },
    }

    expect(readUsdcSpend(freeQuote, sepolia.id)).toBe(0n)
  })

  it('requires an explicit zero total, so an unpriced quote stays null', () => {
    // A quote that merely OMITS its totals has not priced anything, and must
    // keep tripping the guard rather than passing as free.
    expect(
      readUsdcSpend({ tokensSpent: {}, gasCost: {} }, sepolia.id),
    ).toBeNull()

    // A non-zero total with no `tokensSpent` entry is a quote we failed to
    // read, not a free intent.
    expect(
      readUsdcSpend(
        { tokensSpent: {}, feeBreakdownUSD: { totalFeeUSD: 0.91 } },
        sepolia.id,
      ),
    ).toBeNull()
  })

  it('prefers a real tokensSpent entry over the zero-cost path', () => {
    // Totals reading 0 must never mask an actual spend.
    expect(
      readUsdcSpend(
        {
          tokensSpent: {
            '11155111': { [usdc.toLowerCase()]: { unlocked: '7' } },
          },
          feeBreakdownUSD: { totalFeeUSD: 0 },
        },
        sepolia.id,
      ),
    ).toBe(7n)
  })
})

describe('estimateHcaBudgetActor', () => {
  const PRICE_BASE = 4_000_000n
  const PRICE_PREMIUM = 0n

  const prepareTransaction = vi.fn()

  const budgetSigner = {
    type: 'rhinestone',
    account: {
      getAddress: () => HCA,
      prepareTransaction: (...args: unknown[]) => prepareTransaction(...args),
    },
  } as unknown as Signer

  /** A quote the orchestrator priced successfully (source stays `'quote'`). */
  const pricedQuote = {
    intentRoute: {
      intentCost: {
        tokensSpent: {
          [String(sepolia.id)]: {
            [C.usdc.toLowerCase()]: { locked: '0', unlocked: '900000' },
          },
        },
      },
    },
  }

  const budgetClient = {
    chain: sepolia,
    // `readRegisterPrice` goes through the client's own method.
    readContract: vi.fn().mockResolvedValue([PRICE_BASE, PRICE_PREMIUM]),
    // Resolver not yet deployed — the batch opens with `deployProxy`.
    getCode: vi.fn().mockResolvedValue('0x'),
  } as unknown as PublicClient

  const input = {
    name: 'myname.eth',
    duration: 31_536_000n,
    publicClient: budgetClient,
    chainId: sepolia.id,
    signer: budgetSigner,
  }

  /** The `prepareTransaction` params for the reveal (register) leg. */
  const registerLegParams = () => {
    // Legs are quoted commit-first, then register.
    const [params] = prepareTransaction.mock.calls[1] as unknown as [
      { calls: { to: Address; data: Hex }[]; gasLimit: bigint },
    ]
    return params
  }

  beforeEach(() => {
    prepareTransaction.mockReset()
    prepareTransaction.mockResolvedValue(pricedQuote)
    // `readHcaUsdcBalanceActor` — the HCA starts empty.
    readContract.mockResolvedValue(0n)
  })

  // The quoted spend leaves out the relay fee in the refund overhead; at
  // ~1 Mwei that under-funded a first registration's reveal on Sepolia.
  it('budgets each leg for the refund overhead the quote signs, not only its spend', async () => {
    prepareTransaction.mockResolvedValue({
      intentRoute: {
        intentCost: {
          tokensSpent: {
            [String(sepolia.id)]: {
              [C.usdc.toLowerCase()]: { locked: '0', unlocked: '3765' },
            },
          },
        },
        intentOp: {
          signedMetadata: {
            tokenPrices: { ETH: 2560.7, USDC: 1 },
            gasPrices: { [String(sepolia.id)]: '1100031' },
          },
          elements: [
            {
              mandate: {
                qualifier: {
                  settlementContext: {
                    gasRefund: {
                      token: C.usdc,
                      exchangeRate: '2560716071',
                      overhead: ((21_717n << 128n) | 2_597_034n).toString(),
                    },
                  },
                },
              },
            },
          ],
        },
      },
    })

    const breakdown = (await estimateHcaBudgetActor(input))._unsafeUnwrap()

    // `legFeeUsdc` alone gives 15_899 here: (450k + 2 × 2,597,034) gas × 1.1
    // Mwei × the exchange rate, above the 10_017 such a commit was charged
    // against a 3_765 spend. At this gas price the per-chain floor is the
    // larger of the two bounds, so it is what the leg ends up funded from.
    expect(breakdown.commitCost).toBeGreaterThanOrEqual(15_899n)
    expect(breakdown.registerCost).toBeGreaterThanOrEqual(breakdown.commitCost)
  })

  it('quotes the reveal batch WITH the primary-name call when one is set', async () => {
    // The permit is sized from this quote, so the quoted batch must be the
    // batch that gets submitted. Pricing a reveal without the adapter call
    // under-funds the HCA by that call's fee and the reveal then fails for
    // insufficient USDC — the exact regression this locks.
    const result = await estimateHcaBudgetActor({
      ...input,
      primaryName: 'myname.eth',
    })

    expect(result.isOk()).toBe(true)

    const adapterCall = registerLegParams().calls.find((call) =>
      isAddressEqual(call.to, C.defaultReverseRegistrarHcaAdapter),
    )
    expect(adapterCall).toBeDefined()

    const decoded = decodeFunctionData({
      abi: parseAbi(['function setNameWithHCA(address addr, string name)']),
      // biome-ignore lint/style/noNonNullAssertion: asserted defined above
      data: adapterCall!.data,
    })
    expect(decoded.functionName).toBe('setNameWithHCA')
    // The real name, so the calldata (and cost basis) matches byte for byte.
    expect((decoded.args as any)[1]).toBe('myname.eth')
  })

  it('widens the register gas limit by the primary-name delta', async () => {
    // The rail prices the quote on the LIMIT (measured: /intents/route returns
    // an identical cost for 5 vs 6 executions at the same limit), so a limit
    // that does not cover the extra call under-funds the permit.
    await estimateHcaBudgetActor({ ...input, primaryName: 'myname.eth' })
    const withName = registerLegParams().gasLimit

    prepareTransaction.mockClear()
    await estimateHcaBudgetActor(input)
    const withoutName = registerLegParams().gasLimit

    expect(withName - withoutName).toBe(
      primaryNameGas('myname.eth') + HCA_ADDR_REVERSE_CLEAR_GAS,
    )
  })

  it('scales the widening with the name length', async () => {
    // Measured on a Sepolia fork: <=31 bytes is one SSTORE (34_624 gas) but a
    // 33-byte name is three (79_981). A flat allowance sized for the short
    // case silently under-funds the long one.
    const long = `${'n'.repeat(29)}.eth` // 33 bytes
    expect(long.length).toBeGreaterThan(31)

    await estimateHcaBudgetActor({ ...input, primaryName: long })
    const withLong = registerLegParams().gasLimit

    prepareTransaction.mockClear()
    await estimateHcaBudgetActor({ ...input, primaryName: 'short.eth' })
    const withShort = registerLegParams().gasLimit

    expect(withLong).toBeGreaterThan(withShort)
    expect(withLong - withShort).toBe(
      primaryNameGas(long) - primaryNameGas('short.eth'),
    )
  })

  it('omits the primary-name call when the user did not opt in', async () => {
    await estimateHcaBudgetActor(input)

    expect(
      registerLegParams().calls.some((call) =>
        isAddressEqual(call.to, C.defaultReverseRegistrarHcaAdapter),
      ),
    ).toBe(false)
  })

  it('funds the resolver deploy in the register gas limit exactly when the batch carries it', async () => {
    // WEB-1506 / Immunefi #89462: the batch prepended `deployProxy` on a first
    // registration but the limit stayed flat, and the rail prices the leg on
    // the limit alone — so the deploy was quoted, and funded, at nothing.
    const hasDeploy = () =>
      registerLegParams().calls.some((call) =>
        isAddressEqual(call.to, C.verifiableFactory),
      )

    await estimateHcaBudgetActor(input)
    const firstRegistration = registerLegParams().gasLimit
    expect(hasDeploy()).toBe(true)

    prepareTransaction.mockClear()
    vi.mocked(budgetClient.getCode).mockResolvedValueOnce('0xfe')
    await estimateHcaBudgetActor(input)
    const existingResolver = registerLegParams().gasLimit
    expect(hasDeploy()).toBe(false)

    // At least the deploy's measured execution gas on Sepolia.
    expect(firstRegistration - existingResolver).toBeGreaterThanOrEqual(
      185_904n,
    )
  })

  it('refuses a non-canonical label instead of pricing the twin', async () => {
    const result = await estimateHcaBudgetActor({
      ...input,
      name: 'MyName.eth',
    })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().message).toMatch(/canonical form/)
    // The refusal lands before any leg is priced.
    expect(prepareTransaction).not.toHaveBeenCalled()
  })
})
