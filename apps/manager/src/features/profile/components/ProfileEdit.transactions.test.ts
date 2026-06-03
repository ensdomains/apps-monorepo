import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SaveRecordsParams } from './ProfileEdit.transactions'
import { RecordsValidationError, saveRecords } from './ProfileEdit.transactions'

vi.mock('@ens-apps/transaction-manager', () => ({
  getSmartAccountAddress: vi.fn(
    () => '0x0000000000000000000000000000000000000003',
  ),
  transactionManager: {
    startTransaction: vi.fn(() => 'tx-1'),
  },
  waitForTransaction: vi.fn(async () => ({ hash: '0xabc' })),
}))

vi.mock('@ensdomains/ensjs/wallet', () => ({
  setRecordsWriteParameters: vi.fn(async () => ({
    abi: [],
    args: [],
    functionName: 'multicall',
  })),
}))

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>()
  return {
    ...actual,
    encodeFunctionData: vi.fn(() => '0x'),
  }
})

const baseParams = (
  texts: SaveRecordsParams['after']['texts'],
  beforeTexts: SaveRecordsParams['before']['texts'] = [],
): SaveRecordsParams => ({
  name: 'example.eth',
  before: { texts: beforeTexts, coins: [] },
  after: { texts, coins: [] },
  signer: { type: 'eoa' } as SaveRecordsParams['signer'],
  accountAddress: '0x0000000000000000000000000000000000000001',
  publicClient: {} as SaveRecordsParams['publicClient'],
  chainId: 1,
  resolverAddress: '0x0000000000000000000000000000000000000002',
})

describe('saveRecords URL validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unsafe website URL schemes before creating a transaction', async () => {
    await expect(
      saveRecords(
        baseParams([
          { key: 'url', value: 'javascript:alert(document.domain)' },
        ]),
      ),
    ).rejects.toBeInstanceOf(RecordsValidationError)
  })

  it('rejects unsafe profile link URL schemes before creating a transaction', async () => {
    await expect(
      saveRecords(
        baseParams([
          {
            key: 'links',
            value: JSON.stringify([
              { name: 'Evil', url: 'data:text/html,<script>alert(1)</script>' },
            ]),
          },
        ]),
      ),
    ).rejects.toBeInstanceOf(RecordsValidationError)
  })

  it('rejects unchanged unsafe website URL schemes when other records change', async () => {
    await expect(
      saveRecords(
        baseParams(
          [
            { key: 'url', value: 'javascript:alert(document.domain)' },
            { key: 'description', value: 'After' },
          ],
          [
            { key: 'url', value: 'javascript:alert(document.domain)' },
            { key: 'description', value: 'Before' },
          ],
        ),
      ),
    ).rejects.toBeInstanceOf(RecordsValidationError)
  })

  it('rejects unchanged unsafe profile link URL schemes when other records change', async () => {
    const unsafeLinks = JSON.stringify([
      { name: 'Evil', url: 'data:text/html,<script>alert(1)</script>' },
    ])

    await expect(
      saveRecords(
        baseParams(
          [
            { key: 'links', value: unsafeLinks },
            { key: 'description', value: 'After' },
          ],
          [
            { key: 'links', value: unsafeLinks },
            { key: 'description', value: 'Before' },
          ],
        ),
      ),
    ).rejects.toBeInstanceOf(RecordsValidationError)
  })

  it('accepts http and https website and profile link URLs', async () => {
    await expect(
      saveRecords(
        baseParams([
          { key: 'url', value: 'https://ens.domains' },
          {
            key: 'links',
            value: JSON.stringify([
              { name: 'Docs', url: 'https://docs.ens.domains' },
              { name: 'Mirror', url: 'http://example.com' },
            ]),
          },
        ]),
      ),
    ).resolves.toMatchObject({ txId: 'tx-1' })
  })
})
