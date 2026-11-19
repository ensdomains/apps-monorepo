import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Address } from 'viem'
import { useSignTypedData } from 'wagmi'
import { envConfig } from '@/config'
import {
  invalidateAvatar,
  refreshRecordImage,
} from '@/features/records/helpers/recordImageCache'
import type { RecordImageKind } from '@/features/records/helpers/recordImageCrop'
import {
  getRecordImageChoice,
  getRecordImageKind,
  type PreparedRecordImage,
  prepareRecordImage,
  type RecordImageChoice,
  submitRecordImage,
} from '@/features/records/helpers/recordImageUpload'
import type {
  EditableRecord,
  EditableTypes,
} from '@/utils/records/editRecordUtils'
import { useRecordImageOperation } from './useRecordImageOperation'

export const useRecordImageEditor = ({
  address,
  connectorUid,
  name,
  originalRecords,
  editableTypes,
  isTransactionModalOpen,
  stageImage,
  keepHostedImage,
}: {
  readonly address: Address
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
      })
    },
    [name, originalRecords, editableTypes],
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

  const uploadImage = (
    upload: PreparedRecordImage,
    assertCurrent: () => void,
    signal: AbortSignal,
  ) =>
    submitRecordImage({
      upload,
      address,
      now: Date.now(),
      sign: (request) =>
        signTypedData.mutateAsync({ ...request, account: address }),
      put: fetch,
      signal,
      assertCurrent,
    })

  const handleConfirmImage = async (file: File) => {
    if (!imageDialog) return
    const { kind, mode, imageUrl } = imageDialog
    const isChoiceCurrent = () => {
      const current = latestChoice.current(kind)
      return current?.mode === mode && current.imageUrl === imageUrl
    }

    await runImageOperation(async (assertCurrent, signal) => {
      const upload = await prepareRecordImage(imageDialog, file)
      assertCurrent()

      if (mode === 'stage') {
        stageImage(upload)
      } else {
        await uploadImage(upload, assertCurrent, signal)
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
