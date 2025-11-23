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
import { sha256 } from 'viem'
import { useAccount, useChainId, useSignTypedData } from 'wagmi'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { imageSelectionMachine } from '@/features/profile/machines/imageSelection'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import { cn } from '@/lib/utils'
import { inspect } from '@/utils/xstate'

const UPLOAD_TIMEOUT_MS = 30000

interface ErrorDisplayProps {
  error: string | null
}

const ErrorDisplay = ({ error }: ErrorDisplayProps) => {
  if (!error) return null

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  )
}

const ONE_WEEK_MS = 1000 * 60 * 60 * 24 * 7

type ImageType = 'avatar' | 'header'

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
  const [open, setOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLButtonElement>(null)

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
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const files = e.dataTransfer.files
    if (files.length === 0) return

    const file = files[0]
    if (file?.type.startsWith('image/')) {
      const imageUrl = URL.createObjectURL(file)
      setUploadFile(file)
      setUploadPreviewUrl(imageUrl)
      send({ type: 'OPEN_UPLOAD', imageUrl })
    } else {
      send({ type: 'SET_ERROR', error: 'Please select a valid image file' })
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (file.type.startsWith('image/')) {
        const imageUrl = URL.createObjectURL(file)
        setUploadFile(file)
        setUploadPreviewUrl(imageUrl)
        send({ type: 'OPEN_UPLOAD', imageUrl })
      } else {
        send({ type: 'SET_ERROR', error: 'Please select a valid image file' })
      }
    }
  }

  const fileToDataURL = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = (err) => reject(err)
      reader.readAsDataURL(file)
    })

  const dataURLToBytes = (dataURL: string) => {
    const [, base64 = ''] = dataURL.split(',')
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    return bytes
  }

  const getChainName = () => {
    if (!chainId || chainId === 1) return 'mainnet'
    // Default to sepolia for non-mainnet in this app
    return 'sepolia'
  }

  const { mutate: uploadImage, isPending: isUploading } = useMutation({
    mutationFn: async () => {
      if (!name) throw new Error('Name is required to upload an image')
      if (!uploadFile) throw new Error('No image selected for upload')
      if (!isConnected || !address)
        throw new Error('Please connect your wallet before uploading an image')

      const dataURL = await fileToDataURL(uploadFile)

      const chainName = getChainName()
      const baseUrlRoot = 'https://euc.li'

      let endpoint: string
      if (type === 'avatar') {
        const baseURL =
          chainName === 'mainnet' ? baseUrlRoot : `${baseUrlRoot}/${chainName}`
        endpoint = `${baseURL}/${name}`
      } else {
        // header
        endpoint =
          chainName === 'mainnet'
            ? `${baseUrlRoot}/${name}/h`
            : `${baseUrlRoot}/${chainName}/${name}/h`
      }

      const hashBytes = sha256(dataURLToBytes(dataURL))
      const urlHash = Array.from(hashBytes)
        .map((b) => b.toString().padStart(2, '0'))
        .join('')
      const expiry = `${Date.now() + ONE_WEEK_MS}`

      const sig = await signTypedDataAsync({
        primaryType: 'Upload',
        domain: {
          name: 'Ethereum Name Service',
          version: '1',
        },
        types: {
          Upload: [
            { name: 'upload', type: 'string' },
            { name: 'expiry', type: 'string' },
            { name: 'name', type: 'string' },
            { name: 'hash', type: 'string' },
          ],
        },
        message: {
          upload: type,
          expiry,
          name,
          hash: urlHash,
        },
      })

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)

      try {
        const response = await fetch(endpoint, {
          method: 'PUT',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            expiry,
            dataURL,
            sig,
            unverifiedAddress: address,
          }),
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`Upload failed with status ${response.status}`)
        }

        const result = (await response.json()) as
          | { message: string }
          | { error: string; status?: number }

        if ('message' in result && result.message === 'uploaded') {
          // Save Avup endpoint as the text record value
          onImageChange(endpoint)
          setOpen(false)
          setUploadFile(null)
          setUploadPreviewUrl(null)
          send({ type: 'RESET' })
          return
        }

        if ('error' in result) {
          throw new Error(result.error)
        }

        throw new Error('Unknown error')
      } catch (err) {
        clearTimeout(timeoutId)
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error('Upload timed out. Please try again.')
        }
        throw err
      }
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Failed to upload image'
      send({ type: 'SET_ERROR', error: message })
    },
  })

  // Get appropriate dimensions and styling based on type
  const getImageStyles = (size: 'small' | 'medium' | 'large' = 'medium') => {
    const baseClasses = 'mx-auto rounded-md object-cover'

    if (type === 'avatar') {
      const sizeClasses = {
        small: 'size-20',
        medium: 'size-32',
        large: 'size-40',
      }
      return `${baseClasses} ${sizeClasses[size]}`
    } else {
      const sizeClasses = {
        small: 'h-20 w-full',
        medium: 'h-32 w-full',
        large: 'h-40 w-full',
      }
      return `${baseClasses} ${sizeClasses[size]}`
    }
  }

  // Main step - shows all options
  const renderMainStep = () => (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <p className="text-gray-600 text-sm">{description}</p>}
      </DialogHeader>

      <ErrorDisplay error={state.context.error} />

      <div className="space-y-4">
        <Button
          onClick={() => send({ type: 'OPEN_NFT_SELECTION' })}
          variant="outline"
          className="w-full justify-start"
        >
          <Image className="size-4" />
          Choose an NFT
        </Button>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Upload className="size-4" />
            <span className="font-medium text-sm">Upload or drag & drop</span>
          </div>
          <button
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="w-full rounded-lg border-2 border-gray-300 border-dashed p-6 text-center transition-colors hover:border-gray-400"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mx-auto mb-2 size-8 text-gray-400" />
            <p className="mb-2 text-gray-600 text-sm">
              Drag and drop an image here, or
            </p>
            <div className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Browse Files
            </div>
          </button>
        </div>

        <Button
          onClick={() => send({ type: 'OPEN_MANUAL_INPUT' })}
          variant="outline"
          className="w-full justify-start"
        >
          <Keyboard className="size-4" />
          Enter URL Manually
        </Button>

        {hasImage && (
          <Button
            onClick={() => send({ type: 'OPEN_REMOVE_CONFIRMATION' })}
            variant="outline"
            className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="mr-2 size-4" />
            Remove {type === 'avatar' ? 'Avatar' : 'Header'}
          </Button>
        )}
      </div>
    </>
  )

  // Remove confirmation step
  const renderRemoveConfirmationStep = () => (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => send({ type: 'BACK' })}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <DialogTitle>
            Remove {type === 'avatar' ? 'Avatar' : 'Header'}
          </DialogTitle>
        </div>
        <p className="text-gray-600 text-sm">
          Are you sure you want to remove your current {type}? This will revert
          to the default image.
        </p>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="mb-2 font-medium text-sm">Current</p>
            <ImageFallback.Root>
              <ImageFallback.Image
                src={displayImage}
                alt={`Current ${type}`}
                className={getImageStyles('small')}
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
            <p className="mb-2 font-medium text-sm">Default</p>
            <img
              src={defaultImage || placeholderAvatar}
              alt={`Default ${type}`}
              className={getImageStyles('small')}
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => send({ type: 'CANCEL' })}>
          Cancel
        </Button>
        <Button
          onClick={() => send({ type: 'CONFIRM_REMOVAL' })}
          variant="destructive"
        >
          Remove
        </Button>
      </DialogFooter>
    </>
  )

  // NFT selection step
  const renderNFTSelectionStep = () => (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => send({ type: 'BACK' })}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <DialogTitle>Choose an NFT</DialogTitle>
        </div>
      </DialogHeader>

      <ErrorDisplay error={state.context.error} />

      <div className="space-y-4">
        <div className="relative">
          <Search className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-gray-400" />
          <Input
            placeholder="Search your NFTs..."
            value={state.context.searchQuery}
            onChange={(e) =>
              send({ type: 'UPDATE_SEARCH_QUERY', query: e.target.value })
            }
            className="pl-10"
          />
        </div>

        <div className="grid max-h-64 grid-cols-2 gap-4 overflow-y-auto">
          {state.context.filteredNFTs.map((nft) => (
            <button
              type="button"
              key={nft.id}
              onClick={() => send({ type: 'SELECT_NFT', nft })}
              className="rounded-md p-2 text-left transition-colors hover:bg-gray-50"
            >
              <img
                src={nft.image}
                alt={nft.name}
                className="mb-2 h-24 w-full rounded-md object-cover"
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
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => send({ type: 'BACK' })}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <DialogTitle>Confirm NFT Selection</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-center">
            <img
              src={nft.image}
              alt={nft.name}
              className={getImageStyles('large')}
            />
            <p className="mt-2 font-medium">{nft.name}</p>
            <p className="text-gray-500 text-sm">{nft.collection}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => send({ type: 'BACK' })}>
            Back
          </Button>
          <Button onClick={() => send({ type: 'CONFIRM_NFT' })}>
            Use This NFT
          </Button>
        </DialogFooter>
      </>
    )
  }

  // Upload preview step
  const renderUploadPreviewStep = () => (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => send({ type: 'BACK' })}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <DialogTitle>Crop Image</DialogTitle>
        </div>
        <p className="text-gray-600 text-sm">
          Crop your image to fit the {type === 'avatar' ? 'avatar' : 'header'}{' '}
          dimensions.
        </p>
      </DialogHeader>

      <ErrorDisplay error={state.context.error} />

      <div className="space-y-4">
        <div className="text-center">
          <img
            src={uploadPreviewUrl || ''}
            alt="Uploaded"
            className={getImageStyles('large')}
          />
          <p className="mt-2 text-gray-500 text-sm">
            <Crop className="mr-1 inline size-4" />
            Cropping functionality coming soon
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => send({ type: 'BACK' })}>
          Back
        </Button>
        <Button onClick={() => uploadImage()} disabled={isUploading}>
          {isUploading ? 'Uploading…' : 'Upload & Use Image'}
        </Button>
      </DialogFooter>
    </>
  )

  // Manual input step
  const renderManualInputStep = () => (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => send({ type: 'BACK' })}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <DialogTitle>Enter Image URL</DialogTitle>
        </div>
        <p className="text-gray-600 text-sm">
          Enter the URL of an image. Supported formats: JPG, PNG, GIF, WebP.
          <a
            href="https://docs.ens.domains/ens-app/profile/records/avatar"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 text-blue-600 hover:underline"
          >
            Learn more
          </a>
        </p>
      </DialogHeader>

      <ErrorDisplay error={state.context.error} />

      <div className="space-y-4">
        <Input
          placeholder="https://example.com/image.jpg"
          value={state.context.manualUrl}
          onChange={(e) =>
            send({ type: 'UPDATE_MANUAL_URL', url: e.target.value })
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              send({ type: 'PREVIEW_MANUAL_URL' })
            }
          }}
        />
        <Button
          onClick={() => send({ type: 'PREVIEW_MANUAL_URL' })}
          disabled={!state.context.manualUrl.trim()}
          className="w-full"
        >
          Preview Image
        </Button>
      </div>
    </>
  )

  // Manual preview step
  const renderManualPreviewStep = () => (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => send({ type: 'BACK' })}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <DialogTitle>Preview Image</DialogTitle>
        </div>
      </DialogHeader>

      <ErrorDisplay error={state.context.error} />

      <div className="space-y-4">
        <div className="text-center">
          <img
            src={state.context.manualUrl}
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
          />
          <p className="mt-2 text-gray-500 text-sm">
            <Eye className="mr-1 inline size-4" />
            Preview of your image
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => send({ type: 'BACK' })}>
          Back
        </Button>
        <Button onClick={() => send({ type: 'CONFIRM_MANUAL_URL' })}>
          Use This Image
        </Button>
      </DialogFooter>
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

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (isOpen) {
          send({ type: 'RESET' })
        }
        setOpen(isOpen)
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className={clsx(
            'group relative block w-full cursor-pointer overflow-hidden',
            type === 'avatar' && 'rounded-md',
            type === 'header' && 'aspect-[3/1] md:aspect-[5/1]',
          )}
          title={`Change ${type}`}
        >
          <div
            className={clsx(
              'absolute inset-0 flex items-center justify-center bg-transparent transition-all duration-200 group-hover:bg-black/20',
              type === 'avatar' && 'rounded-md',
            )}
          >
            <div className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <Image className="size-6 text-white" />
            </div>
          </div>
          <ImageFallback.Root>
            <ImageFallback.Image
              src={displayImage}
              alt={`${name || 'Profile'} ${type}`}
              className="h-full w-full object-cover"
            />
            <ImageFallback.Fallback>
              {defaultImage ? (
                <img
                  src={defaultImage}
                  alt={`Default ${type}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className={clsx(
                    type === 'header'
                      ? 'h-full w-full bg-gray-200'
                      : 'h-48 w-full bg-gray-200 md:h-64',
                  )}
                />
              )}
            </ImageFallback.Fallback>
          </ImageFallback.Root>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        {renderStep()}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </DialogContent>
    </Dialog>
  )
}
