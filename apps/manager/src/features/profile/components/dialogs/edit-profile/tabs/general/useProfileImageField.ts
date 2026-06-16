import { useMutation, useQuery } from '@tanstack/react-query'
import { useMachine } from '@xstate/react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useAccount, useChainId, useSignTypedData } from 'wagmi'
import { imageSelectionMachine } from '@/features/profile/machines/imageSelection'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import { uploadImageMutationOptions } from '@/features/profile/service/profileImageUpload'
import { inspect } from '@/utils/xstate'
import {
  cropImageFile,
  getConstrainedCropOffset,
  getCropViewportSize,
} from './ProfileImageField.crop'
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
} from './ProfileImageField.helpers'
import type {
  ProfileImageCropOffset,
  ProfileImageFieldProps,
  ProfileImageSize,
} from './ProfileImageField.types'

export const useProfileImageField = ({
  isActive,
  currentImage,
  disabled,
  kind,
  name,
  onActivate,
  onCancel,
  onImageChange,
  onImageRemove,
  onImageUploadComplete,
}: ProfileImageFieldProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null)
  const [cropImageSize, setCropImageSize] = useState<ProfileImageSize | null>(
    null,
  )
  const [cropOffset, setCropOffset] = useState<ProfileImageCropOffset>({
    x: 0,
    y: 0,
  })
  const [cropZoom, setCropZoom] = useState(1)
  const [isCropping, setIsCropping] = useState(false)
  const hasImage = Boolean(currentImage?.trim())
  const imageQuery = useQuery({
    ...parseAvatarQuery(currentImage),
    enabled: hasImage,
  })
  const displayImage = uploadPreviewUrl || imageQuery.data || currentImage
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { signTypedDataAsync } = useSignTypedData()

  const [state, send] = useMachine(imageSelectionMachine, {
    input: {
      onImageChange: (url: string) => {
        onImageChange(url)
        onCancel()
      },
      onImageRemove: () => {
        onImageRemove()
        onCancel()
      },
    },
    inspect,
  })

  const resetEditor = () => {
    send({ type: 'RESET' })
    setUploadFile(null)
    setUploadPreviewUrl(null)
    setCropImageSize(null)
    setCropOffset({ x: 0, y: 0 })
    setCropZoom(1)
    setIsCropping(false)
  }

  const handleCancel = () => {
    resetEditor()
    onCancel()
  }

  const { mutate: uploadImage, isPending: isUploading } = useMutation(
    uploadImageMutationOptions({
      type: kind,
      name,
      isConnected,
      address,
      chainId,
      signTypedDataAsync,
      onImageChange,
      onImageUploadComplete: (imageUrl) =>
        onImageUploadComplete?.(kind, imageUrl),
      setOpen: (open) => {
        if (!open) {
          resetEditor()
          onCancel()
        }
      },
      send,
    }),
  )

  useEffect(() => {
    if (!isActive) {
      send({ type: 'RESET' })
      setUploadFile(null)
      setUploadPreviewUrl(null)
      setCropImageSize(null)
      setCropOffset({ x: 0, y: 0 })
      setCropZoom(1)
      setIsCropping(false)
    }
  }, [isActive, send])

  useEffect(() => {
    return () => {
      if (uploadPreviewUrl) {
        URL.revokeObjectURL(uploadPreviewUrl)
      }
    }
  }, [uploadPreviewUrl])

  const processSelectedFile = (file: File) => {
    if (disabled) return

    if (!file.type.startsWith('image/')) {
      send({ type: 'SET_ERROR', error: 'Please select a valid image file' })
      return
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      send({
        type: 'SET_ERROR',
        error: `Image must be under ${MAX_FILE_SIZE_MB}MB`,
      })
      return
    }

    send({ type: 'CLEAR_ERROR' })
    setUploadFile(file)
    setCropImageSize(null)
    setCropOffset({ x: 0, y: 0 })
    setCropZoom(1)
    setUploadPreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl)
      return URL.createObjectURL(file)
    })
    onActivate()
    send({ type: 'OPEN_UPLOAD' })
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) processSelectedFile(file)
    event.target.value = ''
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()

    const file = event.dataTransfer.files[0]
    if (file) processSelectedFile(file)
  }

  const handleUploadClick = () => {
    send({ type: 'CLEAR_ERROR' })
    fileInputRef.current?.click()
  }

  const handleManualClick = () => {
    send({ type: 'CLEAR_ERROR' })
    send({ type: 'OPEN_MANUAL_INPUT' })
  }

  const handleRemoveClick = () => {
    send({ type: 'CLEAR_ERROR' })
    if (hasImage) {
      send({ type: 'OPEN_REMOVE_CONFIRMATION' })
      return
    }
    onImageRemove()
    handleCancel()
  }

  const handleManualPreviewError = () => {
    send({
      type: 'SET_ERROR',
      error:
        'Failed to load image. Please check that the URL points to a valid image file.',
    })
  }

  const constrainCropOffset = (
    offset: ProfileImageCropOffset,
    zoom = cropZoom,
    imageSize = cropImageSize,
  ) =>
    getConstrainedCropOffset({
      imageSize,
      offset,
      viewportSize: getCropViewportSize(kind),
      zoom,
    })

  const handleCropOffsetChange = (offset: ProfileImageCropOffset) => {
    setCropOffset(constrainCropOffset(offset))
  }

  const handleCropZoomChange = (zoom: number) => {
    setCropZoom(zoom)
    setCropOffset((currentOffset) => constrainCropOffset(currentOffset, zoom))
  }

  const handleCropImageLoad = (imageSize: ProfileImageSize) => {
    setCropImageSize(imageSize)
    setCropOffset({ x: 0, y: 0 })
    setCropZoom(1)
  }

  const handleConfirmCrop = async () => {
    if (!uploadFile || !cropImageSize) {
      send({ type: 'SET_ERROR', error: 'No image selected for upload' })
      return
    }

    setIsCropping(true)
    try {
      const croppedFile = await cropImageFile({
        file: uploadFile,
        imageSize: cropImageSize,
        kind,
        offset: cropOffset,
        zoom: cropZoom,
      })
      setUploadFile(croppedFile)
      setUploadPreviewUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl)
        return URL.createObjectURL(croppedFile)
      })
      uploadImage(croppedFile)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to crop image'
      send({ type: 'SET_ERROR', error: message })
    } finally {
      setIsCropping(false)
    }
  }

  return {
    cropImageSize,
    cropOffset,
    cropZoom,
    displayImage,
    fileInputRef,
    handleCancel,
    handleConfirmCrop,
    handleCropImageLoad,
    handleCropOffsetChange,
    handleCropZoomChange,
    handleDragOver,
    handleDrop,
    handleFileChange,
    handleManualClick,
    handleManualPreviewError,
    handleRemoveClick,
    handleUploadClick,
    hasImage,
    isCropping,
    isUploading,
    send,
    state,
    uploadFile,
    uploadImage,
    uploadPreviewUrl,
  }
}
