import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMachine } from '@xstate/react'
import clsx from 'clsx'
import {
  AlertCircle,
  ArrowLeft,
  Crop,
  Eye,
  Image,
  Keyboard,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useAccount, useChainId, useSignTypedData } from 'wagmi'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { imageSelectionMachine } from '@/features/profile/machines/imageSelection'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import {
  type ImageType,
  uploadImageMutationOptions,
} from '@/features/profile/service/profileImageUpload'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { inspect } from '@/utils/xstate'

const MAX_FILE_SIZE_MB = 3
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

interface ErrorDisplayProps {
  error: string | null
}

const ErrorDisplay = ({ error }: ErrorDisplayProps) => {
  if (!error) return null

  return (
    <Alert className="mb-4" variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  )
}

interface StepHeaderProps {
  title: string
  description?: React.ReactNode
  onBack?: () => void
}

const StepHeader = ({ title, description, onBack }: StepHeaderProps) => (
  <>
    <div className="flex items-center gap-2">
      {onBack && (
        <Button onClick={onBack} size="sm" variant="ghost">
          <ArrowLeft className="size-4" />
        </Button>
      )}
      <h3 className="font-semibold text-lg">{title}</h3>
    </div>
    {description && <p className="text-gray-600 text-sm">{description}</p>}
  </>
)

interface StepFooterProps {
  children: React.ReactNode
}

const StepFooter = ({ children }: StepFooterProps) => (
  <div className="flex justify-end gap-2">{children}</div>
)

interface ImageSelectionDialogProps {
  currentImage?: string
  defaultImage?: string
  onImageChange: (imageUrl: string) => void
  onImageRemove: () => void
  title: string
  description?: string
  type: ImageType
  name?: string // For better alt text and debugging
}

export const ImageSelectionDialog = ({
  currentImage,
  defaultImage,
  onImageChange,
  onImageRemove,
  title,
  description,
  type,
  name,
}: ImageSelectionDialogProps) => {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLButtonElement>(null)
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const hasImage = currentImage && currentImage.trim() !== ''

  // Resolve the current image if it's an IPFS/NFT URL
  const resolvedImage = useQuery({
    ...parseAvatarQuery(currentImage),
    enabled: !!currentImage && open, // Only resolve when dialog is open
  })

  // Use resolved image if available, otherwise fall back to original
  const displayImage = resolvedImage.data || currentImage

  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { signTypedDataAsync } = useSignTypedData()

  const [state, send] = useMachine(imageSelectionMachine, {
    input: {
      onImageChange: (url: string) => {
        onImageChange(url)
        setOpen(false)
      },
      onImageRemove: () => {
        onImageRemove()
        setOpen(false)
      },
    },
    inspect,
  })

  // File handling functions
  const processSelectedFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setValidationError('Please select a valid image file')
      return
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setValidationError(`Image must be under ${MAX_FILE_SIZE_MB}MB`)
      return
    }
    setValidationError(null)
    const imageUrl = URL.createObjectURL(file)
    setUploadFile(file)
    setUploadPreviewUrl(imageUrl)
    send({ type: 'OPEN_UPLOAD', imageUrl })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const file = e.dataTransfer.files[0]
    if (file) processSelectedFile(file)
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) processSelectedFile(file)
  }

  const {
    mutate: uploadImage,
    isPending: isUploading,
    error: uploadError,
  } = useMutation(
    uploadImageMutationOptions({
      type,
      name,
      uploadFile,
      isConnected,
      address,
      chainId,
      signTypedDataAsync,
      onImageChange,
      setOpen,
      setUploadFile,
      send,
    }),
  )

  // Get appropriate dimensions and styling based on type
  const getImageStyles = (size: 'small' | 'medium' | 'large' = 'medium') => {
    const baseClasses = 'mx-auto rounded-md object-cover'

    if (type === 'avatar') {
      const sizeClasses = {
        small: 'size-20',
        medium: 'size-32',
        large: 'size-40',
      }
      return clsx(baseClasses, sizeClasses[size])
    }
    const sizeClasses = {
      small: 'h-20 w-full',
      medium: 'h-32 w-full',
      large: 'h-40 w-full',
    }
    return clsx(baseClasses, sizeClasses[size])
  }

  // Main step - shows all options
  const renderMainStep = () => (
    <>
      <StepHeader description={description} title={title} />

      <ErrorDisplay error={validationError || state.context.error} />

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Upload className="size-4" />
            <span className="font-medium text-sm">
              <Trans>Upload or drag & drop</Trans>
            </span>
          </div>
          <button
            className="w-full rounded-lg border-2 border-gray-300 border-dashed p-6 text-center transition-colors hover:border-gray-400"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            ref={dropZoneRef}
            type="button"
          >
            <Upload className="mx-auto mb-2 size-8 text-gray-400" />
            <p className="mb-2 text-gray-600 text-sm">
              <Trans>Drag and drop an image here, or</Trans>
            </p>
            <div className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <Trans>Browse Files</Trans>
            </div>
          </button>
        </div>

        <Button
          className="w-full justify-start"
          onClick={() => send({ type: 'OPEN_MANUAL_INPUT' })}
          variant="outline"
        >
          <Keyboard className="size-4" />
          <Trans>Enter URL Manually</Trans>
        </Button>

        {hasImage && (
          <Button
            className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => send({ type: 'OPEN_REMOVE_CONFIRMATION' })}
            variant="outline"
          >
            <Trash2 className="mr-2 size-4" />
            {type === 'avatar' ? (
              <Trans>Remove Avatar</Trans>
            ) : (
              <Trans>Remove Header</Trans>
            )}
          </Button>
        )}
      </div>
    </>
  )

  // Remove confirmation step
  const renderRemoveConfirmationStep = () => (
    <>
      <StepHeader
        description={
          type === 'avatar'
            ? t`Are you sure you want to remove your current avatar? This will revert to the default image.`
            : t`Are you sure you want to remove your current header? This will revert to the default image.`
        }
        onBack={() => send({ type: 'BACK' })}
        title={type === 'avatar' ? t`Remove Avatar` : t`Remove Header`}
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="mb-2 font-medium text-sm">
              <Trans>Current</Trans>
            </p>
            <ImageFallback.Root>
              <ImageFallback.Image
                alt={`Current ${type}`}
                className={getImageStyles('small')}
                src={displayImage}
              />
              <ImageFallback.Fallback>
                <div
                  className={cn(
                    getImageStyles('small'),
                    'flex items-center justify-center bg-gray-200',
                  )}
                >
                  <Image className="size-8 text-gray-400" />
                </div>
              </ImageFallback.Fallback>
            </ImageFallback.Root>
          </div>
          <div className="text-center">
            <p className="mb-2 font-medium text-sm">
              <Trans>Default</Trans>
            </p>
            <img
              alt={`Default ${type}`}
              className={getImageStyles('small')}
              src={defaultImage || placeholderAvatar}
            />
          </div>
        </div>
      </div>

      <StepFooter>
        <Button onClick={() => send({ type: 'CANCEL' })} variant="outline">
          <Trans>Cancel</Trans>
        </Button>
        <Button
          onClick={() => send({ type: 'CONFIRM_REMOVAL' })}
          variant="destructive"
        >
          <Trans>Remove</Trans>
        </Button>
      </StepFooter>
    </>
  )

  // NFT selection step
  const renderNFTSelectionStep = () => (
    <>
      <StepHeader
        onBack={() => send({ type: 'BACK' })}
        title={t`Choose an NFT`}
      />

      <ErrorDisplay error={state.context.error} />

      <div className="space-y-4">
        <div className="relative">
          <Search className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-gray-400" />
          <Input
            aria-label={t`Search your NFTs`}
            className="pl-10"
            onChange={(e) =>
              send({ type: 'UPDATE_SEARCH_QUERY', query: e.target.value })
            }
            placeholder={t`Search your NFTs...`}
            value={state.context.searchQuery}
          />
        </div>

        <div className="grid max-h-64 grid-cols-2 gap-4 overflow-y-auto">
          {state.context.filteredNFTs.map((nft) => (
            <button
              className="rounded-md p-2 text-left transition-colors hover:bg-gray-50"
              key={nft.id}
              onClick={() => send({ type: 'SELECT_NFT', nft })}
              type="button"
            >
              <img
                alt={nft.name}
                className="mb-2 h-24 w-full rounded-md object-cover"
                src={nft.image}
              />
              <p className="truncate font-medium text-sm">{nft.name}</p>
              <p className="truncate text-gray-500 text-xs">{nft.collection}</p>
            </button>
          ))}
        </div>
      </div>
    </>
  )

  // NFT confirmation step
  const renderNFTConfirmationStep = () => {
    const nft = state.context.selectedNFT
    if (!nft) return null

    return (
      <>
        <StepHeader
          onBack={() => send({ type: 'BACK' })}
          title={t`Confirm NFT Selection`}
        />

        <div className="space-y-4">
          <div className="text-center">
            <img
              alt={nft.name}
              className={getImageStyles('large')}
              src={nft.image}
            />
            <p className="mt-2 font-medium">{nft.name}</p>
            <p className="text-gray-500 text-sm">{nft.collection}</p>
          </div>
        </div>

        <StepFooter>
          <Button onClick={() => send({ type: 'BACK' })} variant="outline">
            <Trans>Back</Trans>
          </Button>
          <Button onClick={() => send({ type: 'CONFIRM_NFT' })}>
            <Trans>Use This NFT</Trans>
          </Button>
        </StepFooter>
      </>
    )
  }

  // Upload preview step
  const uploadErrorMessage =
    uploadError instanceof Error ? uploadError.message : null
  const renderUploadPreviewStep = () => (
    <>
      <StepHeader
        description={
          type === 'avatar'
            ? t`Crop your image to fit the avatar dimensions.`
            : t`Crop your image to fit the header dimensions.`
        }
        onBack={() => send({ type: 'BACK' })}
        title={t`Crop Image`}
      />
      <ErrorDisplay error={uploadErrorMessage} />
      <div className="space-y-4">
        <div className="text-center">
          <img
            alt="Uploaded"
            className={getImageStyles('large')}
            src={uploadPreviewUrl || ''}
          />
          <p className="mt-2 text-gray-500 text-sm">
            <Crop className="mr-1 inline size-4" />
            <Trans>Cropping functionality coming soon</Trans>
          </p>
        </div>
      </div>

      <StepFooter>
        <Button onClick={() => send({ type: 'BACK' })} variant="outline">
          <Trans>Back</Trans>
        </Button>
        <Button disabled={isUploading} onClick={() => uploadImage()}>
          {isUploading ? (
            <Trans>Uploading…</Trans>
          ) : (
            <Trans>Upload & Use Image</Trans>
          )}
        </Button>
      </StepFooter>
    </>
  )

  // Manual input step
  const renderManualInputStep = () => (
    <>
      <StepHeader
        description={
          <>
            <Trans>
              Enter the URL of an image. Supported formats: JPG, PNG, GIF, WebP.
            </Trans>
            <a
              className="ml-1 text-blue-600 hover:underline"
              href="https://docs.ens.domains/ens-app/profile/records/avatar"
              rel="noopener noreferrer"
              target="_blank"
            >
              <Trans>Learn more</Trans>
            </a>
          </>
        }
        onBack={() => send({ type: 'BACK' })}
        title={t`Enter Image URL`}
      />

      <ErrorDisplay error={state.context.error} />

      <div className="space-y-4">
        <Input
          onChange={(e) =>
            send({ type: 'UPDATE_MANUAL_URL', url: e.target.value })
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              send({ type: 'PREVIEW_MANUAL_URL' })
            }
          }}
          placeholder="https://example.com/image.jpg"
          value={state.context.manualUrl}
        />
        <Button
          className="w-full"
          disabled={!state.context.manualUrl.trim()}
          onClick={() => send({ type: 'PREVIEW_MANUAL_URL' })}
        >
          <Trans>Preview Image</Trans>
        </Button>
      </div>
    </>
  )

  // Manual preview step
  const renderManualPreviewStep = () => (
    <>
      <StepHeader
        onBack={() => send({ type: 'BACK' })}
        title={t`Preview Image`}
      />
      <ErrorDisplay error={state.context.error} />
      <div className="space-y-4">
        <div className="text-center">
          <img
            alt="Preview"
            className={getImageStyles('large')}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              send({
                type: 'SET_ERROR',
                error:
                  'Failed to load image. Please check that the URL points to a valid image file.',
              })
            }}
            src={state.context.manualUrl}
          />
          <p className="mt-2 text-gray-500 text-sm">
            <Eye className="mr-1 inline size-4" />
            <Trans>Preview of your image</Trans>
          </p>
        </div>
      </div>

      <StepFooter>
        <Button onClick={() => send({ type: 'BACK' })} variant="outline">
          <Trans>Back</Trans>
        </Button>
        <Button onClick={() => send({ type: 'CONFIRM_MANUAL_URL' })}>
          <Trans>Use This Image</Trans>
        </Button>
      </StepFooter>
    </>
  )

  // Main render function that determines which step to show
  const renderStep = () => {
    if (state.matches('main')) return renderMainStep()
    if (state.matches('removeConfirmation'))
      return renderRemoveConfirmationStep()
    if (state.matches({ nftSelection: 'browsing' }))
      return renderNFTSelectionStep()
    if (state.matches({ nftSelection: 'confirming' }))
      return renderNFTConfirmationStep()
    if (state.matches('uploadPreview')) return renderUploadPreviewStep()
    if (state.matches({ manualInput: 'entering' }))
      return renderManualInputStep()
    if (state.matches({ manualInput: 'previewing' }))
      return renderManualPreviewStep()
    return null
  }

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      send({ type: 'RESET' })
      setValidationError(null)
      setUploadPreviewUrl(null)
    }
    setOpen(isOpen)
  }

  const trigger = (
    <button
      className={clsx(
        'group relative block w-full cursor-pointer overflow-hidden',
        type === 'avatar' && 'h-full rounded-md',
        type === 'header' && 'aspect-[3/1] md:aspect-[5/1]',
      )}
      title={`Change ${type}`}
      type="button"
    >
      <div
        className={clsx(
          'absolute inset-0 flex items-center justify-center bg-transparent transition-all duration-200 group-hover:bg-black/20 motion-reduce:transition-none',
          type === 'avatar' && 'rounded-md',
          type === 'header' && 'pb-12',
        )}
      >
        <div className="opacity-0 transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none">
          <Image className="size-6 text-white" />
        </div>
      </div>
      <ImageFallback.Root>
        <ImageFallback.Image
          alt={`${name || 'Profile'} ${type}`}
          className="h-full w-full object-cover"
          src={uploadPreviewUrl || displayImage}
        />
        <ImageFallback.Fallback>
          {defaultImage ? (
            <img
              alt={`Default ${type}`}
              className="h-full w-full object-cover"
              src={defaultImage}
            />
          ) : (
            <div
              className={clsx(
                type === 'header'
                  ? 'h-full w-full'
                  : 'h-48 w-full bg-gray-200 md:h-64',
              )}
              style={
                type === 'header'
                  ? {
                      backgroundColor: 'var(--color-ens-lapis-dust)',
                      backgroundImage:
                        'radial-gradient(circle, var(--color-ens-lapis-surface) 1px, transparent 1px)',
                      backgroundSize: '8px 8px',
                    }
                  : undefined
              }
            />
          )}
        </ImageFallback.Fallback>
      </ImageFallback.Root>
    </button>
  )

  const fileInput = (
    <input
      accept="image/*"
      className="hidden"
      onChange={handleFileChange}
      ref={fileInputRef}
      type="file"
    />
  )

  if (isDesktop) {
    return (
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="max-w-md">
          {renderStep()}
          {fileInput}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer onOpenChange={handleOpenChange} open={open}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent>
        <div className="space-y-4 px-4 pb-4">
          {renderStep()}
          {fileInput}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
