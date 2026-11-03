import { type Address, createPublicClient, custom, type Hex } from 'viem'
import { mainnet } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { assertMigrationRecipientsCanReceive } from './migrationRecipient'

const RECIPIENT: Address = '0x0000000000000000000000000000000000000001'
const DELEGATION: Hex = '0xef010000000000000000000000000000000000000000ab'

const run = (params: {
  readonly code: Hex
  readonly readDelegate: () => Promise<Hex>
  readonly readRecipient?: () => Promise<Hex>
}) => {
  const publicClient = createPublicClient({
    chain: mainnet,
    transport: custom(
      {
        request: async ({ method, params: arguments_ }) => {
          if (method !== 'eth_getCode')
            throw new Error(
              `A synthetic callback must not decide compatibility: ${method}`,
            )
          if (!Array.isArray(arguments_) || typeof arguments_[0] !== 'string')
            throw new Error('Missing code address')
          if (arguments_[0].toLowerCase() === RECIPIENT.toLowerCase())
            return params.readRecipient?.() ?? params.code
          return params.readDelegate()
        },
      },
      { retryCount: 0 },
    ),
  })
  return assertMigrationRecipientsCanReceive({
    publicClient,
    recipients: [RECIPIENT],
  })
}

describe('migration recipient code reads', () => {
  it('blocks an unreadable recipient code instead of assuming an ordinary EOA', async () => {
    await expect(
      run({
        code: '0x',
        readRecipient: () =>
          Promise.reject(new Error('eth_getCode unavailable')),
        readDelegate: () => Promise.resolve('0x6000'),
      }),
    ).rejects.toMatchObject({
      name: 'MigrationRecipientCheckError',
      reason: 'unavailable',
      recipient: RECIPIENT,
    })
  })

  it.each(['0x', '0x6000'] as const)(
    'preserves the existing path for nondelegated code %s',
    async (code) => {
      await expect(
        run({
          code,
          readDelegate: () =>
            Promise.reject(new Error('delegate read must not run')),
        }),
      ).resolves.toBeUndefined()
    },
  )

  it('leaves unrecognized delegates to real simulation without a dummy callback', async () => {
    await expect(
      run({ code: DELEGATION, readDelegate: () => Promise.resolve('0x6000') }),
    ).resolves.toBeUndefined()
  })

  it('rejects a code-bearing recipient whose delegation target has no runtime', async () => {
    await expect(
      run({ code: DELEGATION, readDelegate: () => Promise.resolve('0x') }),
    ).rejects.toMatchObject({
      name: 'MigrationRecipientCheckError',
      reason: 'incompatible',
      recipient: RECIPIENT,
    })
  })

  it('keeps an internal RPC failure while reading the delegate retryable', async () => {
    await expect(
      run({
        code: DELEGATION,
        readDelegate: () =>
          Promise.reject({ code: -32603, message: 'RPC upstream timeout' }),
      }),
    ).rejects.toMatchObject({
      name: 'MigrationRecipientCheckError',
      reason: 'unavailable',
      recipient: RECIPIENT,
    })
  })
})
