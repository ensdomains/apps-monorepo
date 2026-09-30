import { type Address, type Chain, getAddress, type WalletClient } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ChainIdMismatchError,
  SignerAddressMismatchError,
  TransactionSubmissionError,
  TransactionUserRejectedError,
} from '../errors/transaction.errors'
import type { EOASigner } from '../types/signer.types'
import type { EOATransactionRequest } from '../types/transaction.types'
import { submitEOATransaction } from './eoa-transport.actor'

// Mock the viem action behind safeSendTransaction so the happy path resolves
// without a real network/wallet.
const sendTransaction = vi.fn()
vi.mock('viem/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem/actions')>()
  return {
    ...actual,
    sendTransaction: (...args: unknown[]) => sendTransaction(...args),
  }
})

const ACCOUNT = getAddress('0x000000000000000000000000000000000000aaaa')
const OTHER = getAddress('0x000000000000000000000000000000000000bbbb')
const TO = getAddress('0x000000000000000000000000000000000000cccc')

// `chain` is passed as an options bag rather than a defaulted positional so
// that `{}` really does yield an undefined chain — a positional default would
// swallow an explicit `undefined`, which is the exact case under test.
function eoaSigner(
  accountAddress: Address | undefined,
  { chain }: { chain?: Chain } = { chain: sepolia },
): EOASigner {
  return {
    type: 'eoa',
    walletClient: {
      chain,
      account: accountAddress ? { address: accountAddress } : undefined,
    } as unknown as WalletClient,
  }
}

function eoaRequest(from: Address): EOATransactionRequest {
  return {
    type: 'eoa',
    from,
    to: TO,
    chainId: 11155111,
    value: 0n,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('submitEOATransaction', () => {
  it('submits when request.from matches the wallet account', async () => {
    sendTransaction.mockResolvedValueOnce('0xhash')

    const result = await submitEOATransaction({
      request: eoaRequest(ACCOUNT),
      signer: eoaSigner(ACCOUNT),
    })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toBe('0xhash')
    expect(sendTransaction).toHaveBeenCalledOnce()
  })

  it('matches checksummed request.from vs lowercase wallet account', async () => {
    sendTransaction.mockResolvedValueOnce('0xhash')

    const result = await submitEOATransaction({
      request: eoaRequest(ACCOUNT),
      signer: eoaSigner(ACCOUNT.toLowerCase() as Address),
    })

    expect(result.isOk()).toBe(true)
    expect(sendTransaction).toHaveBeenCalledOnce()
  })

  it('returns SignerAddressMismatchError when from != wallet account', async () => {
    const result = await submitEOATransaction({
      request: eoaRequest(OTHER),
      signer: eoaSigner(ACCOUNT),
    })

    expect(result.isErr()).toBe(true)
    const error = result._unsafeUnwrapErr()
    expect(error).toBeInstanceOf(SignerAddressMismatchError)
    expect((error as SignerAddressMismatchError).expected).toBe(OTHER)
    expect((error as SignerAddressMismatchError).actual).toBe(ACCOUNT)
    // Fail closed BEFORE prompting the wallet.
    expect(sendTransaction).not.toHaveBeenCalled()
  })

  it('returns SignerAddressMismatchError when wallet has no connected account', async () => {
    const result = await submitEOATransaction({
      request: eoaRequest(ACCOUNT),
      signer: eoaSigner(undefined),
    })

    expect(result.isErr()).toBe(true)
    const error = result._unsafeUnwrapErr()
    expect(error).toBeInstanceOf(SignerAddressMismatchError)
    expect((error as SignerAddressMismatchError).actual).toBeUndefined()
    expect(sendTransaction).not.toHaveBeenCalled()
  })

  it("passes a real Chain so viem's assertCurrentChain runs", async () => {
    sendTransaction.mockResolvedValueOnce('0xhash')

    await submitEOATransaction({
      request: eoaRequest(ACCOUNT),
      signer: eoaSigner(ACCOUNT),
    })

    // Never `null`: viem skips `assertCurrentChain` entirely when `chain` is
    // null, which is what let a wrong-chain wallet through. Passing the chain
    // is what makes viem re-check it against a live `eth_chainId` at send time.
    const [, params] = sendTransaction.mock.calls[0] as [
      unknown,
      { chain: unknown },
    ]
    expect(params.chain).toBe(sepolia)
  })

  it('returns ChainIdMismatchError when the wallet is on another chain', async () => {
    const result = await submitEOATransaction({
      request: eoaRequest(ACCOUNT),
      signer: eoaSigner(ACCOUNT, { chain: mainnet }),
    })

    expect(result.isErr()).toBe(true)
    const error = result._unsafeUnwrapErr()
    expect(error).toBeInstanceOf(ChainIdMismatchError)
    expect((error as ChainIdMismatchError).expected).toBe(sepolia.id)
    expect((error as ChainIdMismatchError).actual).toBe(mainnet.id)
    // Portal renders `error.message` verbatim in the transaction modal, so it
    // has to name the network rather than print a bare id.
    expect(error.message).toContain(mainnet.name)
    expect(sendTransaction).not.toHaveBeenCalled()
  })

  it('returns ChainIdMismatchError when the wallet declares no chain', async () => {
    // wagmi yields `chain: undefined` when the wallet is switched to a chain
    // the app's config does not declare — the case the old `?? null` turned
    // into a silent skip of viem's guard.
    const result = await submitEOATransaction({
      request: eoaRequest(ACCOUNT),
      signer: eoaSigner(ACCOUNT, {}),
    })

    expect(result.isErr()).toBe(true)
    const error = result._unsafeUnwrapErr()
    expect(error).toBeInstanceOf(ChainIdMismatchError)
    expect((error as ChainIdMismatchError).actual).toBeUndefined()
    expect(sendTransaction).not.toHaveBeenCalled()
  })

  it('wraps a send failure in TransactionSubmissionError (matched account)', async () => {
    sendTransaction.mockRejectedValueOnce(new Error('boom'))

    const result = await submitEOATransaction({
      request: eoaRequest(ACCOUNT),
      signer: eoaSigner(ACCOUNT),
    })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(TransactionSubmissionError)
  })

  it('reports a declined send as a rejection, even from another viem copy', async () => {
    // Whenever pnpm splits viem, the app's wallet client throws errors with the
    // right names that are not instances of this package's classes. Misread as
    // a submission failure, the decline would be retried and re-prompted.
    sendTransaction.mockRejectedValueOnce(
      Object.assign(new Error('Transaction execution error'), {
        name: 'TransactionExecutionError',
        cause: Object.assign(new Error('User rejected the request.'), {
          name: 'UserRejectedRequestError',
          code: 4001,
        }),
      }),
    )

    const result = await submitEOATransaction({
      request: eoaRequest(ACCOUNT),
      signer: eoaSigner(ACCOUNT),
    })

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(
      TransactionUserRejectedError,
    )
  })
})
