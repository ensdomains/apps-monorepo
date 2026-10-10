import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { Account, Address, Chain } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import {
  getDestinationContracts,
  MAX_REFUND_AMOUNT,
  MAX_REFUND_EXCHANGE_RATE,
  MAX_REFUND_GAS_OVERHEAD,
} from './manifest'
import { LEGACY_REFUND_CAPS, type RefundCaps } from './refund-caps'
import {
  buildHcaSessionConfig,
  computeDestinationSessionSalt,
  computeSourceSessionSalt,
  createDestinationSession,
  rebuildDestinationSession,
} from './session'

const USDC = getDestinationContracts(sepolia.id).usdc

const HCA = '0xaaaa000000000000000000000000000000000001' as const
const RESOLVER = '0x3333333333333333333333333333333333333333' as const
const SESSION_KEY = '0x9999999999999999999999999999999999999999' as const
const REFUND_TOKEN = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as const
const SESSION_PRIVATE_KEY = `0x${'01'.repeat(32)}` as const

/** Caps a session would be sized with from a ~3M-gas overhead quote. */
const QUOTED_CAPS: RefundCaps = {
  ...LEGACY_REFUND_CAPS,
  maxRefundGasOverhead: 11_889_376n,
}

describe('computeDestinationSessionSalt', () => {
  it('is deterministic for the same inputs', () => {
    const args = {
      hcaSessionNonce: 0n,
      validUntil: 1_800_000_000n,
      resolver: RESOLVER as Address,
      refundToken: REFUND_TOKEN as Address,
    }
    expect(computeDestinationSessionSalt(args)).toBe(
      computeDestinationSessionSalt(args),
    )
  })

  it('changes when the nonce changes (so a new authorization is required)', () => {
    const base = {
      hcaSessionNonce: 0n,
      validUntil: 1_800_000_000n,
      resolver: RESOLVER as Address,
      refundToken: REFUND_TOKEN as Address,
    }
    expect(computeDestinationSessionSalt(base)).not.toBe(
      computeDestinationSessionSalt({ ...base, hcaSessionNonce: 1n }),
    )
  })

  it('changes when the resolver changes (rebinding needs re-auth)', () => {
    const base = {
      hcaSessionNonce: 0n,
      validUntil: 1_800_000_000n,
      resolver: RESOLVER as Address,
      refundToken: REFUND_TOKEN as Address,
    }
    expect(computeDestinationSessionSalt(base)).not.toBe(
      computeDestinationSessionSalt({
        ...base,
        resolver: '0x4444444444444444444444444444444444444444',
      }),
    )
  })

  // Sessions stored before caps were sized per session carry none and were
  // signed with the legacy caps, so the default must reproduce their salt.
  it('defaults the caps to the legacy caps', () => {
    const base = {
      hcaSessionNonce: 0n,
      validUntil: 1_800_000_000n,
      resolver: RESOLVER as Address,
      refundToken: REFUND_TOKEN as Address,
    }
    expect(computeDestinationSessionSalt(base)).toBe(
      computeDestinationSessionSalt({ ...base, ...LEGACY_REFUND_CAPS }),
    )
    expect(computeDestinationSessionSalt(base)).not.toBe(
      computeDestinationSessionSalt({ ...base, ...QUOTED_CAPS }),
    )
  })
})

describe('computeSourceSessionSalt', () => {
  it('is deterministic and sensitive to maxSourceAmount', () => {
    const base = {
      wallet: '0x1111111111111111111111111111111111111111' as Address,
      validUntil: 1_800_000_000n,
      sourceToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
      hca: HCA as Address,
      destinationToken: REFUND_TOKEN as Address,
      destinationChainId: 11155111n,
      maxSourceAmount: 20_000_000n,
      maxDestinationAmount: 14_000_000n,
    }
    expect(computeSourceSessionSalt(base)).toBe(computeSourceSessionSalt(base))
    expect(computeSourceSessionSalt(base)).not.toBe(
      computeSourceSessionSalt({ ...base, maxSourceAmount: 21_000_000n }),
    )
  })
})

describe('buildHcaSessionConfig', () => {
  it('carries the session key, expiry, resolver, refund token and caps', () => {
    expect(
      buildHcaSessionConfig({
        chainId: sepolia.id,
        sessionKey: SESSION_KEY,
        validUntil: 1_800_000_000n,
        resolver: RESOLVER,
      }),
    ).toEqual({
      sessionKey: SESSION_KEY,
      validUntil: 1_800_000_000,
      resolver: RESOLVER,
      refundToken: USDC,
      maxRefundExchangeRate: MAX_REFUND_EXCHANGE_RATE,
      maxRefundGasOverhead: Number(MAX_REFUND_GAS_OVERHEAD),
      maxRefundAmount: MAX_REFUND_AMOUNT,
    })
  })

  it('carries the caps it is given', () => {
    expect(
      buildHcaSessionConfig({
        chainId: sepolia.id,
        sessionKey: SESSION_KEY,
        validUntil: 1_800_000_000n,
        resolver: RESOLVER,
        refundCaps: QUOTED_CAPS,
      }).maxRefundGasOverhead,
    ).toBe(11_889_376)
  })

  // The validator re-derives the permission salt from these fields plus the
  // HCA nonce (`_sessionAuthorizationSalt`); any drift from the salt the
  // session was built with fails as InvalidSessionData().
  it('hashes back to the salt the session was built with', () => {
    const config = buildHcaSessionConfig({
      chainId: sepolia.id,
      sessionKey: SESSION_KEY,
      validUntil: 1_800_000_000n,
      resolver: RESOLVER,
    })
    expect(
      computeDestinationSessionSalt({
        hcaSessionNonce: 3n,
        validUntil: BigInt(config.validUntil),
        resolver: config.resolver,
        refundToken: config.refundToken,
        maxRefundExchangeRate: config.maxRefundExchangeRate,
        maxRefundGasOverhead: BigInt(config.maxRefundGasOverhead),
        maxRefundAmount: config.maxRefundAmount,
      }),
    ).toBe(
      computeDestinationSessionSalt({
        hcaSessionNonce: 3n,
        validUntil: 1_800_000_000n,
        resolver: RESOLVER,
        refundToken: USDC,
      }),
    )
  })
})

describe('createDestinationSession', () => {
  function mockAccount() {
    const experimental_getSessionDetails = vi.fn().mockResolvedValue({
      nonces: [0n],
      hashesAndChainIds: [
        { chainId: 11155111n, sessionDigest: `0x${'5'.repeat(64)}` },
      ],
      data: { message: { sessionsAndChainIds: [] } },
    })
    const experimental_signEnableSession = vi
      .fn()
      .mockResolvedValue(`0x${'ab'.repeat(65)}`)
    return {
      account: {
        experimental_getSessionDetails,
        experimental_signEnableSession,
      } as unknown as RhinestoneAccount,
      experimental_getSessionDetails,
      experimental_signEnableSession,
    }
  }

  const publicClient = {
    readContract: vi.fn().mockResolvedValue([HCA, 0n]),
  } as never

  const sessionAccount = { address: SESSION_KEY } as unknown as Account

  it('signs ONE authorization and returns destination enable-data (index 0)', async () => {
    const { account, experimental_signEnableSession } = mockAccount()
    const result = await createDestinationSession({
      rhinestoneAccount: account,
      publicClient,
      chain: sepolia as Chain,
      hca: HCA,
      resolver: RESOLVER,
      sessionAccount,
      validUntil: 1_800_000_000n,
      alreadyDeployed: false,
    })
    expect(result.isOk()).toBe(true)
    expect(experimental_signEnableSession).toHaveBeenCalledTimes(1)
    const value = result._unsafeUnwrap()
    expect(value.enableData.sessionToEnableIndex).toBe(0)
    expect(value.enableData.hcaSessionNonce).toBe(0n)
    expect(value.enableData.userSignature).toMatch(/^0x[0-9a-f]+$/)
    expect(value.session.account?.toLowerCase()).toBe(HCA.toLowerCase())
  })

  it('carries the session config the salt was built from', async () => {
    const { account } = mockAccount()
    const value = (
      await createDestinationSession({
        rhinestoneAccount: account,
        publicClient,
        chain: sepolia as Chain,
        hca: HCA,
        resolver: RESOLVER,
        sessionAccount,
        validUntil: 1_800_000_000n,
        alreadyDeployed: false,
      })
    )._unsafeUnwrap()
    const config = value.enableData.hcaSessionConfig
    expect(config).toEqual(
      buildHcaSessionConfig({
        chainId: sepolia.id,
        sessionKey: SESSION_KEY,
        validUntil: 1_800_000_000n,
        resolver: RESOLVER,
      }),
    )
    expect(value.session.salt).toBe(
      computeDestinationSessionSalt({
        hcaSessionNonce: value.enableData.hcaSessionNonce,
        validUntil: BigInt(config.validUntil),
        resolver: config.resolver,
        refundToken: config.refundToken,
      }),
    )
  })

  it('surfaces a tagged SessionEnableError when signing fails', async () => {
    const { account, experimental_signEnableSession } = mockAccount()
    experimental_signEnableSession.mockRejectedValueOnce(
      new Error('user rejected'),
    )
    const result = await createDestinationSession({
      rhinestoneAccount: account,
      publicClient,
      chain: sepolia as Chain,
      hca: HCA,
      resolver: RESOLVER,
      sessionAccount,
      validUntil: 1_800_000_000n,
      alreadyDeployed: false,
    })
    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()._tag).toBe('SessionEnableError')
  })

  it('authorizes the caps it is given and returns them', async () => {
    const { account } = mockAccount()
    const value = (
      await createDestinationSession({
        rhinestoneAccount: account,
        publicClient,
        chain: sepolia as Chain,
        hca: HCA,
        resolver: RESOLVER,
        sessionAccount,
        validUntil: 1_800_000_000n,
        alreadyDeployed: false,
        refundCaps: QUOTED_CAPS,
      })
    )._unsafeUnwrap()
    expect(value.refundCaps).toEqual(QUOTED_CAPS)
    expect(value.enableData.hcaSessionConfig.maxRefundGasOverhead).toBe(
      Number(QUOTED_CAPS.maxRefundGasOverhead),
    )
    expect(value.session.salt).toBe(
      computeDestinationSessionSalt({
        hcaSessionNonce: 0n,
        validUntil: 1_800_000_000n,
        resolver: RESOLVER,
        refundToken: USDC,
        ...QUOTED_CAPS,
      }),
    )
  })
})

describe('rebuildDestinationSession', () => {
  const params = {
    chain: sepolia as Chain,
    hca: HCA as Address,
    resolver: RESOLVER as Address,
    hcaSessionNonce: 0n,
    validUntil: 1_800_000_000n,
    sessionPrivateKey: SESSION_PRIVATE_KEY,
  }

  it('rebuilds the permission ID only from the caps the session was signed with', () => {
    const legacy = rebuildDestinationSession(params)
    const quoted = rebuildDestinationSession({
      ...params,
      refundCaps: QUOTED_CAPS,
    })
    expect(
      rebuildDestinationSession({ ...params, refundCaps: LEGACY_REFUND_CAPS })
        .permissionId,
    ).toBe(legacy.permissionId)
    expect(quoted.permissionId).not.toBe(legacy.permissionId)
    expect(quoted.session.salt).toBe(
      computeDestinationSessionSalt({
        hcaSessionNonce: 0n,
        validUntil: 1_800_000_000n,
        resolver: RESOLVER,
        refundToken: USDC,
        ...QUOTED_CAPS,
      }),
    )
  })
})
