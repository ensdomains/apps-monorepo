import '@testing-library/jest-dom'
import { approveHcaFunding } from '@ens-apps/transaction-manager/helpers/hca-funding-approval'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { createRhinestoneAccount } from '@rhinestone/sdk'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createPublicClient, createWalletClient, custom } from 'viem'
import { toAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { beforeEach, expect, it, vi } from 'vitest'
import type { submitHcaRenewal } from '../service/hcaRenewal'
import { RenewalUiProvider, useRenewalUiContext } from './renewalUi.context'

const mocks = vi.hoisted(() => ({ submit: vi.fn<typeof submitHcaRenewal>() }))
vi.mock('../service/hcaRenewal', () => ({ submitHcaRenewal: mocks.submit }))
const OWNER = '0x3333333333333333333333333333333333333333'
const SPENDER = '0x1111111111111111111111111111111111111111'
const HASH =
  '0x1111111111111111111111111111111111111111111111111111111111111111'
const TOKEN = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
i18n.loadAndActivate({ locale: 'en', messages: {} })
beforeEach(() => {
  mocks.submit.mockReset()
})

it.each(['consent', 'wallet', 'receipt'] as const)(
  'clears detached %s presentation on provider label reset while preserving approval tracking',
  async (phase) => {
    const transport = custom({ request: async () => undefined })
    const publicClient = createPublicClient({ chain: mainnet, transport })
    const read = vi.spyOn(publicClient, 'readContract').mockResolvedValue(0n)
    vi.spyOn(publicClient, 'estimateContractGas').mockResolvedValue(50_000n)
    vi.spyOn(publicClient, 'estimateFeesPerGas').mockResolvedValue({
      maxFeePerGas: 3n,
      maxPriorityFeePerGas: 1n,
    })
    vi.spyOn(publicClient, 'simulateContract').mockImplementation(
      vi.fn().mockResolvedValue({}),
    )
    const receipt = deferred<{ status: 'success' }>()
    const wait = vi
      .spyOn(publicClient, 'waitForTransactionReceipt')
      .mockImplementation(vi.fn().mockReturnValue(receipt.promise))
    const walletClient = createWalletClient({ chain: mainnet, transport })
    vi.spyOn(walletClient, 'getAddresses').mockResolvedValue([OWNER])
    vi.spyOn(walletClient, 'getChainId').mockResolvedValue(1)
    const hash = deferred<typeof HASH>()
    const send = vi
      .spyOn(walletClient, 'request')
      .mockImplementation(vi.fn(() => hash.promise))
    const account = await createRhinestoneAccount({
      owners: { type: 'ecdsa', accounts: [toAccount(OWNER)] },
    })
    const records = new Map<string, string>()
    const oldFinished = vi.fn()
    mocks.submit.mockImplementationOnce(async (input) =>
      approveHcaFunding({
        publicClient,
        walletClient,
        owner: OWNER,
        token: TOKEN,
        spender: SPENDER,
        chainId: 1,
        amount: 4n,
        signal: input.signal,
        confirmApproval:
          input.approvalFallback?.confirmApproval ?? (() => false),
        onState: input.approvalFallback?.onState,
        environment: {
          storage: {
            getItem: (key) => records.get(key) ?? null,
            setItem: (key, value) => {
              records.set(key, value)
            },
            removeItem: (key) => {
              records.delete(key)
            },
          },
          locks: {
            async request<T>(
              name: string,
              options: LockOptions | LockGrantedCallback<T>,
              callback?: LockGrantedCallback<T>,
            ) {
              const granted = typeof options === 'function' ? options : callback
              if (!granted) throw new Error('Missing lock callback')
              return await granted({ name, mode: 'exclusive' })
            },
          },
        },
      }).match(
        () => {
          oldFinished()
          return { txId: 'tx', quotedFeeUsdc: 1n }
        },
        (error) => {
          oldFinished()
          return Promise.reject(error)
        },
      ),
    )
    mocks.submit.mockImplementation(async (input) => {
      await input.confirmFunding?.({
        permitValue: 4n,
        requiresPermit: false,
        quotedFeeUsdc: 1n,
        hcaBalanceUsdc: 0n,
        requiredUsdc: 3n,
      })
      return { txId: 'bob-tx', quotedFeeUsdc: 1n }
    })
    const Start = () => {
      const { uiActor, label } = useRenewalUiContext()
      return (
        <button
          onClick={() => {
            uiActor.send({ type: 'pricing.step.next' })
            uiActor.send({ type: 'pricing.token.select', token: 'USDC' })
            uiActor.send({
              type: 'renewal.start',
              label,
              duration: 31_536_000n,
              token: 'USDC',
              priceRaw: 4n,
              priceNumber: 4,
              signer: {
                type: 'rhinestone',
                account,
                config: { chain: mainnet },
              },
              ownerAddress: OWNER,
              walletClient,
            })
          }}
          type="button"
        >
          Renew {label}
        </button>
      )
    }
    const app = (label: string) => (
      <I18nProvider i18n={i18n}>
        <RenewalUiProvider
          currentExpiry={1_800_000_000n}
          label={label}
          protocol="v2"
        >
          <Start />
        </RenewalUiProvider>
      </I18nProvider>
    )
    const view = render(app('alice'))
    fireEvent.click(screen.getByRole('button', { name: 'Renew alice' }))
    await screen.findByRole('button', { name: 'Approve USDC' })
    if (phase !== 'consent') {
      fireEvent.click(screen.getByRole('button', { name: 'Approve USDC' }))
      await waitFor(() => expect(send).toHaveBeenCalledOnce())
      if (phase === 'receipt') {
        await act(async () => {
          hash.resolve(HASH)
        })
        await waitFor(() => expect(wait).toHaveBeenCalledOnce())
      }
      expect(screen.getByRole('button', { name: 'Approving' })).toBeDisabled()
    }
    const oldSignal = mocks.submit.mock.calls.at(-1)?.[0].signal
    view.rerender(app('bob'))
    expect(oldSignal?.aborted).toBe(true)
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    if (phase === 'consent') {
      await waitFor(() => expect(oldFinished).toHaveBeenCalledOnce())
      expect(send).not.toHaveBeenCalled()
      expect(records.size).toBe(0)
    } else {
      expect([...records.values()]).toEqual([
        JSON.stringify(
          phase === 'wallet'
            ? { kind: 'reserved', amount: '4' }
            : { kind: 'submitted', amount: '4', hash: HASH },
        ),
      ])
      // A new-name consent must survive late publication from the detached actor.
      fireEvent.click(screen.getByRole('button', { name: 'Renew bob' }))
      await screen.findByRole('button', { name: 'Approve' })
      await act(async () => {
        hash.resolve(HASH)
      })
      await waitFor(() => expect(wait).toHaveBeenCalledOnce())
      expect([...records.values()]).toEqual([
        JSON.stringify({ kind: 'submitted', amount: '4', hash: HASH }),
      ])
      read.mockResolvedValue(4n)
      await act(async () => {
        receipt.resolve({ status: 'success' })
      })
      await waitFor(() => expect(oldFinished).toHaveBeenCalledOnce())
      expect(records.size).toBe(0)
      expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    }
    view.unmount()
    mocks.submit.mockClear()
  },
)
