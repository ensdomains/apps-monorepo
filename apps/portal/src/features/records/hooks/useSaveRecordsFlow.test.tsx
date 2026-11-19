import {
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { mock } from '@wagmi/connectors'
import { okAsync, ResultAsync } from 'neverthrow'
import type { PropsWithChildren } from 'react'
import { custom } from 'viem'
import { sepolia } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createConfig, useWalletClient, WagmiProvider } from 'wagmi'
import { connect } from 'wagmi/actions'
import { getIsPermissionedResolver } from '@/features/resolver/hooks/useIsPermissionedResolver'
import {
  closeTransactionModal,
  useTransactionModal,
} from '@/features/transaction-manager/hooks/useTransactionModal'
import {
  ALL_EDITABLE_TYPES,
  type EditableRecord,
} from '@/utils/records/editRecordUtils'
import type { PreparedRecordImage } from '../helpers/recordImageUpload'
import { useEditRecordsState } from './useEditRecordsState'
import { useRecordImageOperation } from './useRecordImageOperation'
import { useSaveRecordsFlow } from './useSaveRecordsFlow'

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({
    state: { location: { pathname: '/test.eth/edit-records' } },
    latestLocation: { pathname: '/test.eth/edit-records' },
    subscribe: () => () => {},
  }),
}))

vi.mock('@/lib/wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/wagmi')>()),
  ensChain: sepolia,
}))

vi.mock('@/features/resolver/hooks/useIsPermissionedResolver', () => ({
  getIsPermissionedResolver: vi.fn(),
}))

vi.mock('@ens-apps/transaction-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ens-apps/transaction-manager')>()),
  transactionManager: { startTransaction: vi.fn() },
  waitForTransaction: vi.fn(),
}))

const OWNER = '0x1111111111111111111111111111111111111111'
const OTHER_ACCOUNT = '0x2222222222222222222222222222222222222222'
const RESOLVER = '0x3333333333333333333333333333333333333333'
const ORIGINAL_RECORDS: readonly EditableRecord[] = []
const AVATAR: PreparedRecordImage = {
  name: 'test.eth',
  kind: 'avatar',
  imageUrl: 'https://euc.li/test.eth',
  dataURL: 'data:image/jpeg;base64,AA==',
  hash: '00',
}

const readResolver = vi.mocked(getIsPermissionedResolver)
const promptWallet = vi.mocked(transactionManager.startTransaction)
type UploadImage = Parameters<
  typeof useSaveRecordsFlow
>[0]['imageEditor']['uploadImage']

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {
    throw new Error('Promise is not initialized')
  }
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

const setup = async ({
  uploadImage = vi.fn<UploadImage>().mockResolvedValue(undefined),
} = {}) => {
  const config = createConfig({
    chains: [sepolia],
    connectors: [mock({ accounts: [OWNER] })],
    transports: {
      [sepolia.id]: custom({
        request: async () =>
          Promise.reject(new Error('Unexpected RPC request')),
      }),
    },
    storage: null,
  })
  const [connector] = config.connectors
  if (!connector) throw new Error('Missing test connector')
  await connect(config, { connector })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: PropsWithChildren) => (
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )

  const { result } = renderHook(
    () => {
      const editor = useEditRecordsState(ORIGINAL_RECORDS)
      const imageOperation = useRecordImageOperation(OWNER, connector.uid)
      const { isOpen } = useTransactionModal()
      const { isSuccess: isWalletReady } = useWalletClient()
      const flow = useSaveRecordsFlow({
        address: OWNER,
        name: AVATAR.name,
        resolverAddress: RESOLVER,
        draft: {
          originalRecords: ORIGINAL_RECORDS,
          pendingChanges: editor.pendingChanges,
        },
        records: editor.records,
        editableTypes: ALL_EDITABLE_TYPES,
        changesCount: editor.changesCount,
        pendingImages: editor.pendingImages,
        markImageUploaded: editor.markImageUploaded,
        imageEditor: { ...imageOperation, imageDialog: null, uploadImage },
        onSyncComplete: () => {},
      })

      return { editor, flow, isOpen, isWalletReady }
    },
    { wrapper },
  )

  const openReview = () => act(() => result.current.flow.saveControls.onSave())
  const dismissReview = () =>
    act(() => {
      result.current.flow.dismissReview()
      closeTransactionModal()
    })
  const reviewedTransaction = () => {
    const [transaction] = result.current.flow.transactions
    if (!transaction) throw new Error('Save review is closed')
    return transaction
  }

  await waitFor(() => expect(result.current.isWalletReady).toBe(true))
  act(() => result.current.editor.stageImage(AVATAR))
  return {
    result,
    openReview,
    dismissReview,
    reviewedTransaction,
    connector,
    uploadImage,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  readResolver.mockReturnValue(okAsync(true))
  promptWallet.mockReturnValue('submitted')
  vi.mocked(waitForTransaction).mockRejectedValue(
    new Error('Record transaction failed'),
  )
})

afterEach(() => closeTransactionModal())

describe('useSaveRecordsFlow', () => {
  it('retries a failed record transaction without uploading the image again', async () => {
    const {
      result,
      openReview,
      dismissReview,
      reviewedTransaction,
      uploadImage,
    } = await setup()

    await openReview()
    const first = reviewedTransaction()
    act(() => first.onStart())
    await waitFor(() =>
      expect(result.current.flow.saveControls.errorMessage).toBe(
        'Record transaction failed',
      ),
    )
    dismissReview()

    await openReview()
    const retry = reviewedTransaction()
    act(() => retry.onStart())

    await waitFor(() => expect(promptWallet).toHaveBeenCalledTimes(2))
    expect(retry.id).not.toBe(first.id)
    const [firstWrite, retryWrite] = promptWallet.mock.calls
    expect(retryWrite?.[0]).toEqual(firstWrite?.[0])
    expect(retryWrite?.[2]?.id).toBe(retry.id)
    expect(uploadImage).toHaveBeenCalledExactlyOnceWith(
      AVATAR,
      expect.any(Function),
      expect.any(AbortSignal),
    )
  })

  it('does not open the wallet when review is dismissed during transaction preparation', async () => {
    const { result, openReview, dismissReview, reviewedTransaction } =
      await setup()

    await openReview()
    await waitFor(() =>
      expect(reviewedTransaction().intent?.isPending).toBe(false),
    )
    const preparation = deferred<boolean>()
    readResolver.mockReturnValueOnce(
      ResultAsync.fromSafePromise(preparation.promise),
    )
    act(() => reviewedTransaction().onStart())
    await waitFor(() => expect(readResolver).toHaveBeenCalledTimes(2))
    expect(result.current.flow.saveControls.isSaving).toBe(true)

    dismissReview()
    await act(async () => preparation.resolve(true))

    await waitFor(() =>
      expect(result.current.flow.saveControls.isSaving).toBe(false),
    )
    expect(result.current.isOpen).toBe(false)
    expect(result.current.flow.transactions).toEqual([])
    expect(promptWallet).not.toHaveBeenCalled()
  })

  it('aborts an upload on account change and invalidates its review even if the wallet switches back', async () => {
    const upload = deferred<void>()
    const onAbort = vi.fn()
    const uploadImage = vi.fn<UploadImage>((_image, _assertCurrent, signal) => {
      signal.addEventListener('abort', onAbort, { once: true })
      return upload.promise
    })
    const { result, connector } = await setup({ uploadImage })

    let save: Promise<void> | undefined
    act(() => {
      save = result.current.flow.saveControls.onSave()
    })
    expect(uploadImage).toHaveBeenCalledOnce()
    act(() => {
      connector.onAccountsChanged([OTHER_ACCOUNT])
      connector.onAccountsChanged([OWNER])
    })
    expect(onAbort).toHaveBeenCalledOnce()

    await act(async () => {
      upload.resolve()
      await save
    })
    expect(result.current.isOpen).toBe(false)
    expect(result.current.flow.transactions).toEqual([])
    expect(promptWallet).not.toHaveBeenCalled()
  })

  it('blocks Save before an image upload or review while a record is invalid', async () => {
    const { result, uploadImage, openReview } = await setup()
    act(() => result.current.editor.addRecord('text', 'email', 'invalid'))

    expect(result.current.flow.saveControls.hasValidationErrors).toBe(true)
    await openReview()

    expect(uploadImage).not.toHaveBeenCalled()
    expect(result.current.isOpen).toBe(false)
    expect(promptWallet).not.toHaveBeenCalled()
  })
})
