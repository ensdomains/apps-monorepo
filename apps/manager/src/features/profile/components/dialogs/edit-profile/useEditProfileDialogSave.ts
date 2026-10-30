import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { t } from '@lingui/core/macro'
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { match, P } from 'ts-pattern'
import type { Address, PublicClient } from 'viem'
import { useAccount, useChainId, useSignTypedData } from 'wagmi'
import type { Actor } from 'xstate'
import { NameRegistryNotFoundError } from '@/features/profile/service/changeResolver'
import {
  refreshProfileImageCaches,
  updateProfileImageRecords,
} from '@/features/profile/service/profileImageCache'
import {
  type PreparedProfileImageUpload,
  submitPreparedProfileImageUpload,
} from '@/features/profile/service/profileImageUpload'
import {
  type SaveRecordsParams,
  saveRecords,
} from '@/features/profile/service/profileRecordTransactions'
import type {
  ResolverCopySource,
  ResolverImport,
} from '@/features/profile/service/resolverImport'
import {
  assertResolverRecordReview,
  getResolverRecordWrites,
  getResolverReplacementRecords,
  type ResolverRecordReview,
} from '@/features/profile/service/resolverReplacementRecords'
import {
  assertProfileResolverState,
  resolverWriteStateQuery,
} from '@/features/profile/service/resolverWriteAccess'
import {
  OwnedResolverNotReadyError,
  ResolverChangeNotAuthorizedError,
  setupControlledResolver,
} from '@/features/profile/service/setupControlledResolver'
import type { ProfileRecords } from '@/features/profile/types'
import { getResolverReplacement } from '@/features/profile/utils/resolverReplacement'
import { transformToServiceFormat } from '@/features/profile/utils/transformRecords'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
import { hasOwnerWallet } from '@/lib/wallet'
import type {
  editProfileDialogMachine,
  PendingSave,
} from './EditProfileDialog.machine'
import type {
  EditProfileForm,
  EditProfileSaveHandler,
} from './EditProfileDialog.types'

type DeferredEditProfileSave = {
  readonly recordReview: ResolverRecordReview
  readonly currentRecords: ProfileRecords
  readonly options: Parameters<EditProfileSaveHandler>[1]
}

interface UseCloseProfileDialogOnSuccessfulSaveParams {
  readonly dialogActor: Actor<typeof editProfileDialogMachine>
  readonly ethAddressChanged: boolean
  readonly form: EditProfileForm
  readonly isSuccess: boolean
  readonly name: string
  readonly onPreparedImageUploadsSaved: () => void
  readonly onUpdated?: () => undefined | Promise<unknown>
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
  readonly open: boolean
  readonly owner?: Address
  readonly savedRecords: ProfileRecords
  readonly resolverCopySource?: ResolverCopySource
  readonly resolverImport?: ResolverImport
  readonly canSave: boolean
}

interface SaveRecordsMutationVariables extends SaveRecordsParams {
  readonly currentRecords: ProfileRecords
}

interface SetupResolverMutationVariables {
  readonly pendingSave: Extract<PendingSave, { kind: 'setup' }>
}

interface SaveBlockedPrerequisites {
  readonly hasOwner: boolean
  readonly hasAccount: boolean
}

const getSaveBlockedDescription = ({
  hasOwner,
  hasAccount,
}: SaveBlockedPrerequisites) =>
  match({ hasOwner, hasAccount })
    .with(
      { hasOwner: false },
      () => t`Name owner is not available yet. Try again in a moment.`,
    )
    .with(
      { hasAccount: false },
      () =>
        t`Wallet account is not ready. Wait for your account to finish connecting, then try again.`,
    )
    .otherwise(
      () => t`Something went wrong preparing the save. Please try again.`,
    )

const ethCoinValue = (coins: readonly { coinType: number; value: string }[]) =>
  coins.find(({ coinType }) => coinType === 60)?.value

const toastSaveError = (error: unknown) => {
  toast.error(t`Cannot save profile`, {
    description: match(error)
      .with(
        P.instanceOf(NameRegistryNotFoundError),
        () =>
          t`No ENS v2 registry holds this name, so a resolver cannot be set up for it here. An imported DNS name keeps its records in DNS.`,
      )
      .with(
        P.instanceOf(ResolverChangeNotAuthorizedError),
        () =>
          t`Your wallet does not have permission to change the resolver for this name. For a subname, the parent name’s owner controls this.`,
      )
      .with(
        P.instanceOf(OwnedResolverNotReadyError),
        () =>
          t`The replacement resolver could not be verified. Please try again.`,
      )
      .with(P.instanceOf(Error), (saveError) => saveError.message)
      .otherwise(
        () => t`Something went wrong preparing the save. Please try again.`,
      ),
  })
}

const useCloseProfileDialogOnSuccessfulSave = ({
  dialogActor,
  ethAddressChanged,
  form,
  isSuccess,
  name,
  onPreparedImageUploadsSaved,
  onUpdated,
  queryClient,
  savedRecords,
}: UseCloseProfileDialogOnSuccessfulSaveParams) => {
  useEffect(() => {
    if (!isSuccess) {
      return
    }

    let cancelled = false

    const finalizeSave = async () => {
      await updateProfileImageRecords({
        name,
        records: savedRecords,
        queryClient,
      })
      if (cancelled) return
      form.reset(savedRecords)
      await onUpdated?.()
      onPreparedImageUploadsSaved()

      if (ethAddressChanged) {
        queryClient.invalidateQueries({
          queryKey: $qk({ $scope: 'profile', $action: 'reverse_name' }),
        })
      }

      queryClient.invalidateQueries({
        queryKey: $qk({ $scope: 'profile', $action: 'resolver_write_access' }),
      })
      queryClient.invalidateQueries({
        queryKey: $qk({ $scope: 'profile', $action: 'resolver_write_state' }),
      })
      queryClient.invalidateQueries({
        queryKey: $qk({ $scope: 'profile', $action: 'get_records' }),
      })
      queryClient.invalidateQueries({
        queryKey: $qk({ $scope: 'profile', $action: 'resolver_copy_source' }),
      })

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
  open,
  owner,
  savedRecords,
  resolverCopySource,
  resolverImport,
  canSave,
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
  const [setupConfirmOpen, setSetupConfirmOpen] = useState(false)
  const [setupRecordReview, setSetupRecordReview] =
    useState<ResolverRecordReview | null>(null)
  const deferredSetupSaveRef = useRef<DeferredEditProfileSave | null>(null)

  const ownerAddress = account.ownerAddress as Address | null
  const identity = `${name}:${ownerAddress}:${address}:${chainId}`
  const identityRef = useRef<string | null>(identity)
  identityRef.current = identity
  useEffect(() => {
    identityRef.current = identity
    return () => {
      identityRef.current = null
    }
  }, [identity])
  const assertCurrentIdentity = useCallback(() => {
    if (!isConnected || address?.toLowerCase() !== ownerAddress?.toLowerCase())
      throw new Error(
        'Please finish connecting your wallet, then reopen the editor.',
      )
    if (
      identityRef.current !== identity ||
      (publicClient.chain?.id !== undefined &&
        publicClient.chain.id !== chainId)
    )
      throw new Error(
        'Your wallet or network changed. Reopen the editor before saving.',
      )
    if (
      resolverCopySource &&
      (resolverCopySource.wallet.toLowerCase() !==
        ownerAddress?.toLowerCase() ||
        resolverCopySource.chainId !== chainId)
    )
      throw new Error(
        'Your wallet or network changed. Reopen the editor to import the current records.',
      )
  }, [
    address,
    chainId,
    identity,
    isConnected,
    ownerAddress,
    resolverCopySource,
  ])
  const hasResolver = Boolean(savedRecords.resolverAddress)

  const resolverWriteAccess = useQuery({
    ...resolverWriteStateQuery(name, ownerAddress ?? undefined),
    enabled: open && hasResolver && Boolean(ownerAddress),
  })

  // Setup is always an explicit reviewed import or explicit initial setup.
  // A normal draft must never silently become a replacement after a refresh.
  const needsResolverSetup = Boolean(resolverCopySource)

  const reviewedResolverChanged =
    resolverWriteAccess.data &&
    resolverWriteAccess.data.resolverAddress?.toLowerCase() !==
      savedRecords.resolverAddress?.toLowerCase()

  const isResolverAccessPending =
    !canSave ||
    (hasResolver &&
      Boolean(ownerAddress) &&
      (resolverWriteAccess.isPending ||
        resolverWriteAccess.isError ||
        reviewedResolverChanged ||
        (!resolverCopySource && !resolverWriteAccess.data?.canWrite)))

  const setupReplaces = getResolverReplacement({
    isResolverInvalid: resolverWriteAccess.data?.isResolverInvalid === true,
    hasResolver,
  })

  const saveRecordsMutation = useMutation({
    mutationFn: ({
      currentRecords: _currentRecords,
      ...params
    }: SaveRecordsMutationVariables) => saveRecords(params),
    onSuccess: (_data, variables) => {
      dialogActor.send({
        type: 'SAVE_SUCCEEDED',
        currentRecords: variables.currentRecords,
        ethAddressChanged:
          ethCoinValue(variables.before.coins) !==
          ethCoinValue(variables.after.coins),
      })
    },
    onError: (error) => {
      dialogActor.send({ type: 'RESET_SAVE_STATE' })
      toastSaveError(error)
    },
  })

  const setupResolverMutation = useMutation({
    mutationFn: async ({ pendingSave }: SetupResolverMutationVariables) => {
      if (!pendingSave.recordReview)
        throw new Error(
          'Review the exact records before replacing the resolver.',
        )
      const resolver = await setupControlledResolver({
        name: pendingSave.name,
        signer: pendingSave.signer,
        ownerAddress: pendingSave.ownerAddress,
        publicClient: pendingSave.publicClient,
        chainId: pendingSave.chainId,
        before: pendingSave.before,
        after: pendingSave.after,
        description: `Update profile records for ${pendingSave.name}`,
        sourceResolver: pendingSave.sourceResolver,
        assertCurrentIdentity: pendingSave.assertCurrentIdentity,
        resolverImport,
        recordReview: pendingSave.recordReview,
      })

      return {
        currentRecords: {
          ...pendingSave.currentRecords,
          resolverAddress: resolver,
        },
        ethAddressChanged: pendingSave.ethAddressChanged,
      }
    },
    onSuccess: ({ currentRecords, ethAddressChanged: ethChanged }) => {
      dialogActor.send({
        type: 'SAVE_SUCCEEDED',
        currentRecords,
        ethAddressChanged: ethChanged,
      })
    },
    onError: (error) => {
      dialogActor.send({ type: 'RESET_SAVE_STATE' })
      toastSaveError(error)
    },
  })

  const resetSaveState = useCallback(() => {
    saveRecordsMutation.reset()
    setupResolverMutation.reset()
    dialogActor.send({ type: 'RESET_SAVE_STATE' })
  }, [dialogActor, saveRecordsMutation, setupResolverMutation])

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
        assertCurrentIdentity()
        await submitPreparedProfileImageUpload({
          address,
          signTypedDataAsync,
          upload,
        })
        // The hosted image has now changed, even if a later upload or record
        // transaction fails. Refresh only this successfully published image.
        await refreshProfileImageCaches({ images: [upload], queryClient })
      }
    },
    [
      address,
      assertCurrentIdentity,
      isConnected,
      queryClient,
      signTypedDataAsync,
    ],
  )

  const finalizeImageOnlySave = useCallback(
    async (currentRecords: ProfileRecords) => {
      setIsFinalizingImageSave(true)

      try {
        form.reset(currentRecords)
        await onUpdated?.()
        setPreparedImageUploads([])
        dialogActor.send({ type: 'CLOSE' })
      } catch {
        dialogActor.send({ type: 'RESET_SAVE_STATE' })
      } finally {
        setIsFinalizingImageSave(false)
      }
    },
    [dialogActor, form, onUpdated],
  )

  const getPendingRecordSave = useCallback(
    (currentRecords: ProfileRecords, recordReview?: ResolverRecordReview) => {
      try {
        assertCurrentIdentity()
        if (needsResolverSetup) {
          if (!recordReview)
            throw new Error(
              'Review the exact records before replacing the resolver.',
            )
          assertResolverRecordReview(
            getResolverReplacementRecords(
              transformToServiceFormat(savedRecords),
              transformToServiceFormat(currentRecords),
            ),
            recordReview,
          )
        }
      } catch (error) {
        toastSaveError(error)
        return null
      }
      if (isResolverAccessPending) {
        toast.error(t`Cannot save profile`, {
          description: t`Still checking if you can edit this name. Try again in a moment.`,
        })
        return null
      }

      dialogActor.send({
        type: 'SAVE_REQUESTED',
        values: currentRecords,
        deps: {
          chainId,
          name,
          needsResolverSetup,
          owner,
          ownerAddress,
          publicClient: publicClient as PublicClient,
          retryCount: 0,
          walletClient: account.walletClient,
          sourceResolver: resolverCopySource?.resolver,
          assertCurrentIdentity,
          recordReview,
        },
      })

      const snapshot = dialogActor.getSnapshot()
      const pendingSave = snapshot.matches({ editing: 'saving' })
        ? snapshot.context.pendingSave
        : undefined

      if (pendingSave) return pendingSave

      toast.error(t`Cannot save profile`, {
        description: getSaveBlockedDescription({
          hasOwner: Boolean(owner),
          hasAccount: hasOwnerWallet(account.walletClient, ownerAddress),
        }),
      })
      return null
    },
    [
      account.walletClient,
      chainId,
      dialogActor,
      isResolverAccessPending,
      name,
      needsResolverSetup,
      owner,
      ownerAddress,
      assertCurrentIdentity,
      resolverCopySource,
      savedRecords,
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

      await finalizeImageOnlySave(currentRecords)
      return true
    },
    [finalizeImageOnlySave],
  )

  const submitPendingRecordSave = useCallback(
    (pendingRecordSave: PendingSave) => {
      try {
        assertCurrentIdentity()
      } catch (error) {
        dialogActor.send({ type: 'RESET_SAVE_STATE' })
        toastSaveError(error)
        return
      }
      match(pendingRecordSave)
        .with({ kind: 'setup' }, (pendingSave) => {
          setupResolverMutation.mutate({ pendingSave })
        })
        .with({ kind: 'update' }, (pendingSave) => {
          saveRecordsMutation.mutate({
            ...pendingSave.params,
            currentRecords: pendingSave.currentRecords,
          })
        })
        .exhaustive()
    },
    [
      assertCurrentIdentity,
      dialogActor,
      saveRecordsMutation,
      setupResolverMutation,
    ],
  )

  const executeSave = useCallback(
    (
      currentRecords: ProfileRecords,
      options: Parameters<EditProfileSaveHandler>[1],
      recordReview?: ResolverRecordReview,
    ) => {
      if (isResolverAccessPending) {
        toastSaveError(
          new Error(
            'The resolver or your permissions need to be checked. Close the editor and review the current records before publishing.',
          ),
        )
        return
      }
      try {
        assertCurrentIdentity()
      } catch (error) {
        toastSaveError(error)
        return
      }
      resetSaveState()

      void (async () => {
        try {
          if (!ownerAddress)
            throw new Error('Please connect your wallet before publishing.')
          await assertProfileResolverState({
            name,
            resolverAddress: savedRecords.resolverAddress,
            ownerAddress,
            requireWriteAccess: !resolverCopySource,
          })
        } catch (error) {
          toastSaveError(error)
          return
        }
        const pendingRecordSave = options.hasRecordChanges
          ? getPendingRecordSave(currentRecords, recordReview)
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
      assertCurrentIdentity,
      isResolverAccessPending,
      name,
      ownerAddress,
      resolverCopySource,
      savedRecords.resolverAddress,
    ],
  )

  const handleSave = useCallback<EditProfileSaveHandler>(
    (currentRecords, options) => {
      if (options.hasRecordChanges && needsResolverSetup) {
        if (isResolverAccessPending) {
          toast.error(t`Cannot save profile`, {
            description: t`Still checking if you can edit this name. Try again in a moment.`,
          })
          return
        }

        const replacementRecords = getResolverReplacementRecords(
          transformToServiceFormat(savedRecords),
          transformToServiceFormat(currentRecords),
        )
        const recordReview = {
          editedKeys: [...options.editedRecordKeys],
          writes: getResolverRecordWrites(replacementRecords),
        }
        try {
          assertResolverRecordReview(replacementRecords, recordReview)
        } catch (error) {
          toastSaveError(error)
          return
        }
        deferredSetupSaveRef.current = { currentRecords, options, recordReview }
        setSetupRecordReview(recordReview)
        setSetupConfirmOpen(true)
        return
      }

      executeSave(currentRecords, options)
    },
    [executeSave, isResolverAccessPending, needsResolverSetup, savedRecords],
  )

  const confirmSetupSave = useCallback(() => {
    const deferred = deferredSetupSaveRef.current
    deferredSetupSaveRef.current = null
    if (!deferred) return
    executeSave(
      deferred.currentRecords,
      deferred.options,
      deferred.recordReview,
    )
  }, [executeSave])

  const handleSetupConfirmOpenChange = useCallback((nextOpen: boolean) => {
    setSetupConfirmOpen(nextOpen)
    if (!nextOpen) {
      setSetupRecordReview(null)
      deferredSetupSaveRef.current = null
    }
  }, [])

  useCloseProfileDialogOnSuccessfulSave({
    dialogActor,
    ethAddressChanged,
    form,
    isSuccess,
    name,
    onPreparedImageUploadsSaved: handlePreparedImageUploadsSaved,
    onUpdated,
    queryClient,
    savedRecords,
  })

  return {
    recheckResolverAccess: () => {
      void queryClient.invalidateQueries({
        queryKey: $qk({ $scope: 'profile', $action: 'resolver_write_access' }),
      })
      void queryClient.invalidateQueries({
        queryKey: $qk({ $scope: 'profile', $action: 'resolver_write_state' }),
      })
      void queryClient.invalidateQueries({
        queryKey: $qk({ $scope: 'profile', $action: 'resolver_copy_source' }),
      })
      void queryClient.invalidateQueries({
        queryKey: $qk({ $scope: 'profile', $action: 'expiry' }),
      })
    },
    confirmSetupSave,
    handleSave,
    handleImageUploadPrepared,
    handleSetupConfirmOpenChange,
    isFinalizingImageSave,
    isResolverAccessPending,
    setupReplaces,
    resetPreparedImageSaveState,
    preparedImageUploads,
    setupConfirmOpen,
    setupRecordWrites: setupRecordReview?.writes,
  }
}
