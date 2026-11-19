import {
  createFlowScope,
  scopeTransactionId,
} from '@ens-apps/transaction-manager'
import { useQuery } from '@tanstack/react-query'
import { createAtom, useAtom } from '@xstate/store-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type Address, isAddressEqual } from 'viem'
import { useWalletClient } from 'wagmi'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { ensChain } from '@/lib/wagmi'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import type {
  EditableRecord,
  EditableTypes,
} from '@/utils/records/editRecordUtils'
import {
  invalidateAvatar,
  refreshRecordImage,
} from '../helpers/recordImageCache'
import type { PreparedRecordImage } from '../helpers/recordImageUpload'
import {
  canSubmitRecordSave,
  getRecordSaveEligibility,
  isCurrentSavableDraft,
  type RecordSaveDraft,
  uploadImagesBeforeSaveReview,
} from '../helpers/recordSaveFlow'
import { getSaveRecordsIntentQueryOptions } from '../queries/getSaveRecordsIntent'
import type { useRecordImageEditor } from './useRecordImageEditor'
import { useSaveRecords } from './useSaveRecords'

const SAVE_RECORDS_TRANSACTION_ID = 'tx-save-resolver-records'

export const useSaveRecordsFlow = ({
  address,
  name,
  resolverAddress,
  draft,
  records,
  changesCount,
  editableTypes,
  pendingImages,
  imageEditor,
  markImageUploaded,
  onSyncComplete,
}: {
  readonly address: Address
  readonly name: string
  readonly resolverAddress: Address
  readonly draft: RecordSaveDraft
  readonly records: EditableRecord[]
  readonly changesCount: number
  readonly editableTypes: EditableTypes
  readonly pendingImages: readonly PreparedRecordImage[]
  readonly imageEditor: Pick<
    ReturnType<typeof useRecordImageEditor>,
    | 'run'
    | 'isRunning'
    | 'isCurrent'
    | 'imageDialog'
    | 'operation'
    | 'uploadImage'
  >
  readonly markImageUploaded: (upload: PreparedRecordImage) => void
  readonly onSyncComplete: () => void
}) => {
  const { data: walletClient } = useWalletClient()
  const { isOpen, openModal, closeModal, clearTransaction } =
    useTransactionModal()
  const { run, isRunning, isCurrent, imageDialog, operation, uploadImage } =
    imageEditor
  const { validationErrors, hasDisallowedChanges, canSave } = useMemo(
    () => getRecordSaveEligibility({ records, editableTypes, changesCount }),
    [records, editableTypes, changesCount],
  )
  const latest = useRef({ ...draft, canSave, pendingImages })
  useLayoutEffect(() => {
    latest.current = { ...draft, canSave, pendingImages }
  }, [draft, canSave, pendingImages])

  const [imageSaveError, setImageSaveError] = useState<string>()
  const [review] = useState(() => createAtom<string | undefined>(undefined))
  const reviewId = useAtom(review)
  const isStartingTransaction = useRef(false)

  useLayoutEffect(
    () => () => {
      if (review.get() === undefined) return
      review.set(undefined)
      closeModal()
    },
    [closeModal, review],
  )

  const dismissReview = () => review.set(undefined)

  const {
    saveRecords,
    isWriting,
    isConfirming,
    isSyncing,
    error: saveError,
    reset: resetSaveError,
    isWrongChain,
    isSwitchingChain,
    switchToRequiredNetwork,
  } = useSaveRecords({
    onSyncComplete: () => {
      void invalidateAvatar(name)
      // Wait for the indexer before leaving so deleted records stay deleted in the view.
      if (isCurrent()) onSyncComplete()
    },
  })

  const dismissError = () => {
    setImageSaveError(undefined)
    resetSaveError()
  }

  const beginReview = () => {
    // Scope the step id so a settled actor from an earlier review cannot match it.
    review.set(
      scopeTransactionId(SAVE_RECORDS_TRANSACTION_ID, createFlowScope(address)),
    )
    openModal()
  }

  const openSaveReview = async () => {
    if (
      operation.current ||
      isOpen ||
      imageDialog ||
      isWriting ||
      isSyncing ||
      isSwitchingChain ||
      !isCurrentSavableDraft(draft, latest.current)
    )
      return

    if (isWrongChain) {
      switchToRequiredNetwork()
      return
    }
    if (
      !walletClient?.account ||
      !isAddressEqual(walletClient.account.address, address)
    )
      return

    dismissError()
    try {
      await run(
        (assertCurrent, signal) =>
          uploadImagesBeforeSaveReview({
            uploads: pendingImages,
            submit: (upload) => uploadImage(upload, assertCurrent, signal),
            onUploaded: (upload) => {
              markImageUploaded(upload)
              refreshRecordImage(upload.imageUrl, Date.now())
            },
            assertCurrent,
            openReview: beginReview,
          }),
        () =>
          isCurrent(ensChain.id) &&
          isCurrentSavableDraft(draft, latest.current),
      )
    } catch (error) {
      setImageSaveError(
        extractErrorMessage(error, 'Could not save the record images.'),
      )
    }
  }

  const startSaveTransaction = () => {
    if (isStartingTransaction.current || !reviewId || review.get() !== reviewId)
      return
    let isPrepared = false
    const assertCurrent = () => {
      if (
        !canSubmitRecordSave({
          reviewId,
          activeReviewId: review.get(),
          isWalletCurrent: isCurrent(ensChain.id),
          draft,
          current: latest.current,
        })
      ) {
        throw new Error('The editor or wallet changed. Please try again.')
      }
      isPrepared = true
    }

    isStartingTransaction.current = true
    saveRecords(
      { name, resolverAddress, ...draft, id: reviewId, assertCurrent },
      {
        onError: () => {
          if (!isPrepared && review.get() === reviewId) {
            dismissReview()
            closeModal()
          }
        },
        onSettled: () => {
          isStartingTransaction.current = false
        },
      },
    )
  }

  const intent = useQuery(
    getSaveRecordsIntentQueryOptions({
      name,
      resolverAddress,
      ...draft,
      walletClient,
      chainId: ensChain.id,
      isOpen: isOpen && reviewId !== undefined,
      changesCount,
    }),
  )

  const transactions: readonly Transaction[] = reviewId
    ? [
        {
          id: reviewId,
          title: 'Save records',
          transactionName: 'Set resolver records',
          intent: {
            prepare: () => intent.data,
            isPending: intent.isLoading,
            isError: intent.isError,
          },
          onStart: startSaveTransaction,
          onDone: () => {
            dismissReview()
            closeModal()
            clearTransaction()
          },
        },
      ]
    : []

  return {
    validationErrors,
    transactions,
    dismissReview,
    saveControls: {
      onSave: openSaveReview,
      onDismissError: dismissError,
      isSaving: isRunning || isWriting || isConfirming,
      isSyncing,
      isSwitchingChain,
      isWrongChain,
      errorMessage: imageSaveError ?? saveError?.message,
      hasValidationErrors: validationErrors.length > 0,
      hasDisallowedChanges,
    },
  }
}
