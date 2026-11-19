import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Address } from 'viem'
import { usePublicClient, useSignTypedData } from 'wagmi'
import { envConfig } from '@/config'
import { getEnsOwner } from '@/features/profile/hooks/useEnsOwner'
import {
  invalidateAvatar,
  refreshRecordImage,
} from '@/features/records/helpers/recordImageCache'
import type { RecordImageKind } from '@/features/records/helpers/recordImageCrop'
import {
  assertRecordImageOwnership,
  getRecordImageChoice,
  getRecordImageKind,
  isMatchingRecordImageChoice,
  type PreparedRecordImage,
  prepareRecordImage,
  type RecordImageChoice,
  submitRecordImage,
} from '@/features/records/helpers/recordImageUpload'
import { getRecordImageHcaQueryOptions } from '@/features/records/queries/getRecordImageHcaQueryOptions'
import type {
  EditableRecord,
  EditableTypes,
} from '@/utils/records/editRecordUtils'
import { useRecordImageOperation } from './useRecordImageOperation'

export const useRecordImageEditor = ({
  address,
  owner,
  connectorUid,
  name,
  originalRecords,
  editableTypes,
  isTransactionModalOpen,
  stageImage,
  keepHostedImage,
}: {
  readonly address: Address
  readonly owner: Address
  readonly connectorUid: string | undefined
  readonly name: string
  readonly originalRecords: readonly EditableRecord[]
  readonly editableTypes: EditableTypes
  readonly isTransactionModalOpen: boolean
  readonly stageImage: (upload: PreparedRecordImage) => void
  readonly keepHostedImage: (kind: RecordImageKind) => void
}) => {
  const identity = useRecordImageOperation(address, connectorUid)
  const signTypedData = useSignTypedData()
  const queryClient = useQueryClient()
  const chainId = envConfig.chain.id
  const publicClient = usePublicClient({ chainId })
  const hcaOptions = getRecordImageHcaQueryOptions(
    { owner, address, chainId },
    publicClient,
  )
  const hcaQuery = useQuery(hcaOptions)
  const verifiedHca =
    hcaOptions.enabled && hcaQuery.isSuccess ? hcaQuery.data : undefined
  const { operation, run: runImageOperation } = identity
  const [imageDialog, setImageDialog] = useState<RecordImageChoice | null>(null)
  const getImageChoice = useCallback(
    (kind: RecordImageKind | undefined) => {
      if (!kind) return undefined
      return getRecordImageChoice({
        name,
        kind,
        savedRecords: originalRecords,
        editableTypes,
        network: envConfig.network,
        ownership: { owner, address, verifiedHca },
      })
    },
    [name, originalRecords, editableTypes, owner, address, verifiedHca],
  )
  const latestChoice = useRef(getImageChoice)
  useLayoutEffect(() => {
    latestChoice.current = getImageChoice
  }, [getImageChoice])

  const canUploadImage = useCallback(
    (record: EditableRecord) => {
      if (record.type !== 'text') return false
      const kind = getRecordImageKind(record)
      return Boolean(kind && getImageChoice(kind))
    },
    [getImageChoice],
  )
  const openImageDialog = useCallback(
    (kind: RecordImageKind) => {
      if (operation.current || isTransactionModalOpen) return
      const choice = getImageChoice(kind)
      if (choice) setImageDialog(choice)
    },
    [getImageChoice, isTransactionModalOpen, operation],
  )
  const onUploadImage = useCallback(
    (record: EditableRecord) => {
      if (record.type !== 'text') return
      const kind = getRecordImageKind(record)
      if (kind) openImageDialog(kind)
    },
    [openImageDialog],
  )

  const submitImage = (
    upload: PreparedRecordImage,
    mode: RecordImageChoice['mode'],
    assertCurrent: () => void,
    signal: AbortSignal,
  ) => {
    const assertUploadCurrent = () => {
      assertCurrent()
      if (
        !isMatchingRecordImageChoice(
          latestChoice.current(upload.kind),
          upload,
          mode,
        )
      ) {
        throw new Error(
          'This image can no longer be uploaded. Check the wallet, name ownership, and record permissions, then choose the image again.',
        )
      }
    }

    return submitRecordImage({
      upload,
      address,
      now: Date.now(),
      sign: (request) =>
        signTypedData.mutateAsync({ ...request, account: address }),
      put: fetch,
      signal,
      assertCurrent: assertUploadCurrent,
      checkEligibility: async () => {
        assertUploadCurrent()
        await assertRecordImageOwnership({
          address,
          owner,
          readNameOwner: async () =>
            (await getEnsOwner({ name })).unwrapOr(null)?.owner,
          readVerifiedHca: () =>
            queryClient
              .fetchQuery({ ...hcaOptions, staleTime: 0 })
              .catch(() => undefined),
        })
      },
    })
  }

  const uploadImage = (
    upload: PreparedRecordImage,
    assertCurrent: () => void,
    signal: AbortSignal,
  ) => submitImage(upload, 'stage', assertCurrent, signal)

  const handleConfirmImage = async (file: File) => {
    if (!imageDialog) return
    const { kind, mode } = imageDialog
    const isChoiceCurrent = () =>
      isMatchingRecordImageChoice(latestChoice.current(kind), imageDialog, mode)

    await runImageOperation(async (assertCurrent, signal) => {
      const upload = await prepareRecordImage(imageDialog, file)
      assertCurrent()

      if (mode === 'stage') {
        stageImage(upload)
      } else {
        await submitImage(upload, 'replace', assertCurrent, signal)
        refreshRecordImage(upload.imageUrl, Date.now())
        if (kind === 'avatar') void invalidateAvatar(name)
        assertCurrent()
        keepHostedImage(kind)
        toast.success(kind === 'avatar' ? 'Avatar updated' : 'Header updated')
      }
      setImageDialog(null)
    }, isChoiceCurrent)
  }

  const closeImageDialog = () => {
    operation.current?.abort()
    setImageDialog(null)
  }

  return {
    ...identity,
    isEditorLocked: identity.isRunning || isTransactionModalOpen,
    imageDialog,
    closeImageDialog,
    handleConfirmImage,
    getImageChoice,
    openImageDialog,
    canUploadImage,
    onUploadImage,
    uploadImage,
  }
}
