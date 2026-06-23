import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import type { Address, PublicClient } from 'viem'
import { useAccount, useChainId, useSignTypedData } from 'wagmi'
import type { Actor } from 'xstate'
import {
  getActiveSignedProfileImageUploads,
  refreshProfileImageCaches,
  type SignedProfileImageUpload,
} from '@/features/profile/service/profileImageCache'
import {
  type PreparedProfileImageUpload,
  submitPreparedProfileImageUpload,
} from '@/features/profile/service/profileImageUpload'
import {
  type SaveRecordsParams,
  saveRecords,
} from '@/features/profile/service/profileRecordTransactions'
import type { ProfileRecords } from '@/features/profile/types'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
import type { editProfileDialogMachine } from './EditProfileDialog.machine'
import type {
  EditProfileForm,
  EditProfileSaveHandler,
} from './EditProfileDialog.types'

interface UseCloseProfileDialogOnSuccessfulSaveParams {
  readonly dialogActor: Actor<typeof editProfileDialogMachine>
  readonly ethAddressChanged: boolean
  readonly form: EditProfileForm
  readonly isSuccess: boolean
  readonly name: string
  readonly onPreparedImageUploadsSaved: () => void
  readonly onUpdated?: () => undefined | Promise<unknown>
  readonly preparedImageUploads: readonly PreparedProfileImageUpload[]
  readonly queryClient: QueryClient
  readonly savedRecords: ProfileRecords
}

interface UseEditProfileDialogSaveParams {
  readonly dialogActor: Actor<typeof editProfileDialogMachine>
  readonly ethAddressChanged: boolean
  readonly form: EditProfileForm
  readonly isSuccess: boolean
  readonly name: string
  readonly onUpdated?: () => undefined | Promise<unknown>
  readonly owner?: Address
  readonly savedRecords: ProfileRecords
}

interface SaveRecordsMutationVariables extends SaveRecordsParams {
  readonly currentRecords: ProfileRecords
}

const useCloseProfileDialogOnSuccessfulSave = ({
  dialogActor,
  ethAddressChanged,
  form,
  isSuccess,
  name,
  onPreparedImageUploadsSaved,
  onUpdated,
  preparedImageUploads,
  queryClient,
  savedRecords,
}: UseCloseProfileDialogOnSuccessfulSaveParams) => {
  useEffect(() => {
    if (!isSuccess) {
      return
    }

    let cancelled = false

    const finalizeSave = async () => {
      form.reset(savedRecords)
      await onUpdated?.()
      await refreshProfileImageCaches({
        images: getActiveSignedProfileImageUploads({
          images: preparedImageUploads,
          records: savedRecords,
        }),
        name,
        queryClient,
      })
      onPreparedImageUploadsSaved()

      if (ethAddressChanged) {
        queryClient.invalidateQueries({
          queryKey: $qk({ $scope: 'profile', $action: 'reverse_name' }),
        })
      }

      if (!cancelled) {
        dialogActor.send({ type: 'CLOSE' })
      }
    }

    void finalizeSave()

    return () => {
      cancelled = true
    }
  }, [
    dialogActor,
    ethAddressChanged,
    form,
    isSuccess,
    name,
    onPreparedImageUploadsSaved,
    onUpdated,
    preparedImageUploads,
    queryClient,
    savedRecords,
  ])
}

export const useEditProfileDialogSave = ({
  dialogActor,
  ethAddressChanged,
  form,
  isSuccess,
  name,
  onUpdated,
  owner,
  savedRecords,
}: UseEditProfileDialogSaveParams) => {
  const account = useSmartAccountContext()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const queryClient = useQueryClient()
  const { signTypedDataAsync } = useSignTypedData()
  const [preparedImageUploads, setPreparedImageUploads] = useState<
    readonly PreparedProfileImageUpload[]
  >([])
  const [isFinalizingImageSave, setIsFinalizingImageSave] = useState(false)

  const saveRecordsMutation = useMutation({
    mutationFn: ({
      currentRecords: _currentRecords,
      ...params
    }: SaveRecordsMutationVariables) => saveRecords(params),
    onSuccess: (_data, variables) => {
      const ethBefore = variables.before.coins.find(
        ({ coinType }) => coinType === 60,
      )
      const ethAfter = variables.after.coins.find(
        ({ coinType }) => coinType === 60,
      )

      dialogActor.send({
        type: 'SAVE_SUCCEEDED',
        currentRecords: variables.currentRecords,
        ethAddressChanged: ethBefore?.value !== ethAfter?.value,
      })
    },
    onError: () => {
      dialogActor.send({ type: 'RESET_SAVE_STATE' })
    },
  })

  const resetSaveState = useCallback(() => {
    saveRecordsMutation.reset()
    dialogActor.send({ type: 'RESET_SAVE_STATE' })
  }, [dialogActor, saveRecordsMutation])

  const resetPreparedImageSaveState = useCallback(() => {
    setPreparedImageUploads([])
    setIsFinalizingImageSave(false)
  }, [])

  const handlePreparedImageUploadsSaved = useCallback(() => {
    setPreparedImageUploads([])
  }, [])

  const handleImageUploadPrepared = useCallback(
    (upload: PreparedProfileImageUpload) => {
      setPreparedImageUploads((currentUploads) => [
        ...currentUploads.filter(
          (currentUpload) => currentUpload.kind !== upload.kind,
        ),
        upload,
      ])
    },
    [],
  )

  const submitPreparedImageUploads = useCallback(
    async (uploads: readonly PreparedProfileImageUpload[]) => {
      if (uploads.length === 0) return

      if (!isConnected || !address) {
        throw new Error('Please connect your wallet before uploading an image')
      }

      for (const upload of uploads) {
        await submitPreparedProfileImageUpload({
          address,
          signTypedDataAsync,
          upload,
        })
      }
    },
    [address, isConnected, signTypedDataAsync],
  )

  const finalizeImageOnlySave = useCallback(
    async (
      currentRecords: ProfileRecords,
      images: readonly SignedProfileImageUpload[],
    ) => {
      setIsFinalizingImageSave(true)

      try {
        form.reset(currentRecords)
        await onUpdated?.()
        await refreshProfileImageCaches({
          images,
          name,
          queryClient,
        })
        setPreparedImageUploads([])
        dialogActor.send({ type: 'CLOSE' })
      } catch {
        dialogActor.send({ type: 'RESET_SAVE_STATE' })
      } finally {
        setIsFinalizingImageSave(false)
      }
    },
    [dialogActor, form, name, onUpdated, queryClient],
  )

  const getPendingRecordSave = useCallback(
    (currentRecords: ProfileRecords) => {
      dialogActor.send({
        type: 'SAVE_REQUESTED',
        values: currentRecords,
        deps: {
          accountAddress: account.accountAddress as Address | null,
          chainId,
          name,
          owner,
          ownerAddress: account.ownerAddress as Address | null,
          publicClient: publicClient as PublicClient,
          retryCount: 0,
          signer: account.signer,
        },
      })

      const snapshot = dialogActor.getSnapshot()
      if (
        !snapshot.matches({ editing: 'saving' }) ||
        !snapshot.context.pendingSave
      ) {
        return null
      }

      return snapshot.context.pendingSave
    },
    [
      account.accountAddress,
      account.ownerAddress,
      account.signer,
      chainId,
      dialogActor,
      name,
      owner,
    ],
  )

  const submitPreparedImageUploadsForSave = useCallback(
    async (uploads: readonly PreparedProfileImageUpload[]) => {
      if (uploads.length === 0) return true

      setIsFinalizingImageSave(true)

      try {
        await submitPreparedImageUploads(uploads)
        return true
      } catch {
        dialogActor.send({ type: 'RESET_SAVE_STATE' })
        return false
      } finally {
        setIsFinalizingImageSave(false)
      }
    },
    [dialogActor, submitPreparedImageUploads],
  )

  const finalizePreparedImageOnlySave = useCallback(
    async ({
      currentRecords,
      hasRecordChanges,
      uploads,
    }: {
      readonly currentRecords: ProfileRecords
      readonly hasRecordChanges: boolean
      readonly uploads: readonly PreparedProfileImageUpload[]
    }) => {
      if (hasRecordChanges || uploads.length === 0) return false

      await finalizeImageOnlySave(currentRecords, uploads)
      return true
    },
    [finalizeImageOnlySave],
  )

  const submitPendingRecordSave = useCallback(
    (pendingRecordSave: NonNullable<ReturnType<typeof getPendingRecordSave>>) =>
      saveRecordsMutation.mutate({
        ...pendingRecordSave.params,
        currentRecords: pendingRecordSave.currentRecords,
      }),
    [saveRecordsMutation],
  )

  const handleSave = useCallback<EditProfileSaveHandler>(
    (currentRecords, options) => {
      resetSaveState()

      void (async () => {
        const pendingRecordSave = options.hasRecordChanges
          ? getPendingRecordSave(currentRecords)
          : null

        if (options.hasRecordChanges && !pendingRecordSave) {
          return
        }

        const imageUploadsSubmitted = await submitPreparedImageUploadsForSave(
          options.preparedImageUploads,
        )

        if (!imageUploadsSubmitted) {
          return
        }

        const imageOnlySaveFinalized = await finalizePreparedImageOnlySave({
          currentRecords,
          hasRecordChanges: options.hasRecordChanges,
          uploads: options.preparedImageUploads,
        })

        if (imageOnlySaveFinalized) {
          return
        }

        pendingRecordSave && submitPendingRecordSave(pendingRecordSave)
      })()
    },
    [
      finalizePreparedImageOnlySave,
      getPendingRecordSave,
      resetSaveState,
      submitPendingRecordSave,
      submitPreparedImageUploadsForSave,
    ],
  )

  useCloseProfileDialogOnSuccessfulSave({
    dialogActor,
    ethAddressChanged,
    form,
    isSuccess,
    name,
    onPreparedImageUploadsSaved: handlePreparedImageUploadsSaved,
    onUpdated,
    preparedImageUploads,
    queryClient,
    savedRecords,
  })

  return {
    handleSave,
    handleImageUploadPrepared,
    isFinalizingImageSave,
    resetPreparedImageSaveState,
    preparedImageUploads,
  }
}
