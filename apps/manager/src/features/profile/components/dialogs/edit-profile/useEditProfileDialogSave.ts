import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import type { Address, PublicClient } from 'viem'
import { useChainId } from 'wagmi'
import type { Actor } from 'xstate'
import {
  getActiveSignedProfileImageUploads,
  refreshProfileImageCaches,
  type SignedProfileImageUpload,
} from '@/features/profile/service/profileImageCache'
import type { ProfileRecords } from '@/features/profile/types'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
import { getRecordsValidationErrorMessage } from '../../ProfileEdit.errors'
import {
  RecordsValidationError,
  type SaveRecordsParams,
  saveRecords,
} from '../../ProfileEdit.transactions'
import type { editProfileDialogMachine } from './EditProfileDialog.machine'
import type {
  EditProfileForm,
  EditProfileSaveHandler,
} from './EditProfileDialog.types'
import type { ProfileImageKind } from './tabs/general/ProfileImageField'

interface UseCloseProfileDialogOnSuccessfulSaveParams {
  readonly dialogActor: Actor<typeof editProfileDialogMachine>
  readonly ethAddressChanged: boolean
  readonly form: EditProfileForm
  readonly isSuccess: boolean
  readonly name: string
  readonly onSignedImageUploadsSaved: () => void
  readonly onUpdated?: () => undefined | Promise<unknown>
  readonly queryClient: QueryClient
  readonly savedRecords: ProfileRecords
  readonly signedImageUploads: readonly SignedProfileImageUpload[]
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

const getMutationErrorMessage = (error: unknown) => {
  if (error instanceof RecordsValidationError) {
    return getRecordsValidationErrorMessage(error)
  }

  return error instanceof Error ? error.message : String(error)
}

const useCloseProfileDialogOnSuccessfulSave = ({
  dialogActor,
  ethAddressChanged,
  form,
  isSuccess,
  name,
  onSignedImageUploadsSaved,
  onUpdated,
  queryClient,
  savedRecords,
  signedImageUploads,
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
          images: signedImageUploads,
          records: savedRecords,
        }),
        name,
        queryClient,
      })
      onSignedImageUploadsSaved()

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
    onSignedImageUploadsSaved,
    onUpdated,
    queryClient,
    savedRecords,
    signedImageUploads,
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
  const chainId = useChainId()
  const queryClient = useQueryClient()
  const [signedImageUploads, setSignedImageUploads] = useState<
    readonly SignedProfileImageUpload[]
  >([])
  const [isFinalizingSignedImageSave, setIsFinalizingSignedImageSave] =
    useState(false)

  const saveRecordsMutation = useMutation({
    mutationFn: ({
      currentRecords: _currentRecords,
      ...params
    }: SaveRecordsMutationVariables) => saveRecords(params),
    onSuccess: (data, variables) => {
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
        txHash: data.hash,
      })
    },
    onError: (error) => {
      dialogActor.send({
        type: 'SAVE_FAILED',
        errorMessage: getMutationErrorMessage(error),
      })
    },
  })

  const resetSaveState = useCallback(() => {
    saveRecordsMutation.reset()
    dialogActor.send({ type: 'RESET_SAVE_STATE' })
  }, [dialogActor, saveRecordsMutation])

  const resetSignedImageSaveState = useCallback(() => {
    setSignedImageUploads([])
    setIsFinalizingSignedImageSave(false)
  }, [])

  const handleSignedImageUploadsSaved = useCallback(() => {
    setSignedImageUploads([])
  }, [])

  const handleSignedImageUploadComplete = useCallback(
    (kind: ProfileImageKind, imageUrl: string) => {
      setSignedImageUploads((currentUploads) => [
        ...currentUploads.filter((upload) => upload.kind !== kind),
        { kind, imageUrl },
      ])
    },
    [],
  )

  const finalizeSignedImageOnlySave = useCallback(
    async (
      currentRecords: ProfileRecords,
      images: readonly SignedProfileImageUpload[],
    ) => {
      setIsFinalizingSignedImageSave(true)

      try {
        form.reset(currentRecords)
        await onUpdated?.()
        await refreshProfileImageCaches({
          images,
          name,
          queryClient,
        })
        setSignedImageUploads([])
        dialogActor.send({ type: 'CLOSE' })
      } catch (error) {
        dialogActor.send({
          type: 'SAVE_FAILED',
          errorMessage: getMutationErrorMessage(error),
        })
      } finally {
        setIsFinalizingSignedImageSave(false)
      }
    },
    [dialogActor, form, name, onUpdated, queryClient],
  )

  const handleSave = useCallback<EditProfileSaveHandler>(
    (currentRecords, options) => {
      resetSaveState()

      if (!options.hasRecordChanges && options.signedImageUploads.length > 0) {
        void finalizeSignedImageOnlySave(
          currentRecords,
          options.signedImageUploads,
        )
        return
      }

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
          signer: account.signer,
        },
      })

      const snapshot = dialogActor.getSnapshot()
      if (
        !snapshot.matches({ editing: 'saving' }) ||
        !snapshot.context.pendingSave
      ) {
        return
      }

      saveRecordsMutation.mutate({
        ...snapshot.context.pendingSave.params,
        currentRecords: snapshot.context.pendingSave.currentRecords,
      })
    },
    [
      account.accountAddress,
      account.ownerAddress,
      account.signer,
      chainId,
      dialogActor,
      finalizeSignedImageOnlySave,
      name,
      owner,
      resetSaveState,
      saveRecordsMutation,
    ],
  )

  useCloseProfileDialogOnSuccessfulSave({
    dialogActor,
    ethAddressChanged,
    form,
    isSuccess,
    name,
    onSignedImageUploadsSaved: handleSignedImageUploadsSaved,
    onUpdated,
    queryClient,
    savedRecords,
    signedImageUploads,
  })

  return {
    handleSave,
    handleSignedImageUploadComplete,
    isFinalizingSignedImageSave,
    resetSaveState,
    resetSignedImageSaveState,
    signedImageUploads,
  }
}
