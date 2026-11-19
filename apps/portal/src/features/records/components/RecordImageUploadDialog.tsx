import { ImagePlus, Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import { okAsync, ResultAsync } from 'neverthrow'
import type React from 'react'
import { useEffect, useReducer, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cropImageFile } from '@/features/records/helpers/recordImageCanvas'
import {
  type CropOffset,
  getCropAspectLabel,
  getCropImageBox,
  getCropViewportSize,
  getRecordImageErrorMessage,
  IMAGE_UPLOAD_ACCEPT,
  MAX_CROP_ZOOM,
  MAX_IMAGE_FILE_SIZE_MB,
  MIN_CROP_ZOOM,
  RecordImageConfirmError,
  type RecordImageKind,
} from '@/features/records/helpers/recordImageCrop'
import {
  getArrowKeyNudge,
  INITIAL_RECORD_IMAGE_UPLOAD_STATE,
  type RecordImageUploadAction,
  type RecordImageUploadState,
  reduceRecordImageUpload,
} from '@/features/records/helpers/recordImageUploadState'
import { cn } from '@/lib/utils'

export type { RecordImageKind }
export type RecordImageUploadMode = 'replace' | 'stage'

interface RecordImageUploadDialogProps {
  readonly kind: RecordImageKind
  readonly mode: RecordImageUploadMode
  readonly hasConflictingDraft?: boolean
  readonly onConfirm: (file: File) => Promise<void>
  readonly onClose: () => void
}

const CROP_ZOOM_STEP = 0.01

const KIND_TITLES = {
  avatar: 'Upload avatar',
  header: 'Upload header image',
} as const satisfies Record<RecordImageKind, string>

const MODE_COPY = {
  replace: {
    cta: 'Sign and upload',
    note: 'Sign a message to replace this image. No gas fee.',
  },
  stage: {
    cta: 'Add to pending changes',
    note: 'ENS will host this image. When you save, you’ll sign the upload and confirm a transaction to update the record URL. Future replacements are gasless.',
  },
} as const satisfies Record<
  RecordImageUploadMode,
  { readonly cta: string; readonly note: string }
>

type CropState = Extract<RecordImageUploadState, { step: 'crop' }>

interface DragState {
  readonly origin: CropOffset
  readonly pointerId: number
  readonly startX: number
  readonly startY: number
  // Logical viewport pixels per screen pixel, as the viewport may be scaled down.
  readonly scale: number
}

/** Blob URL for the chosen file, revoked when the file changes or on unmount. */
const useObjectUrl = (file: File | null) => {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) return
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => {
      URL.revokeObjectURL(objectUrl)
      setUrl(null)
    }
  }, [file])
  return url
}

/** Lets an async handler skip its follow-up when the parent unmounted us. */
const useIsMountedRef = () => {
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])
  return isMountedRef
}

const ImageDropZone = ({
  kind,
  onFile,
}: {
  readonly kind: RecordImageKind
  readonly onFile: (file: File) => void
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)
    const file = event.dataTransfer.files[0]
    if (file) onFile(file)
  }

  return (
    <section
      aria-label="Image drop zone"
      className={cn(
        'flex flex-col items-center gap-3 rounded-sm border border-dashed bg-muted px-4 py-8 text-center transition-colors',
        isDragOver ? 'border-primary' : 'border-border',
      )}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <ImagePlus aria-hidden="true" className="size-6 text-muted-foreground" />
      <p className="text-p">Drag an image here, or</p>
      <Button variant="outline" onClick={() => inputRef.current?.click()}>
        Choose image
      </Button>
      <p className="text-small text-muted-foreground">
        JPG, PNG, GIF, WebP, AVIF, BMP or ICO, up to {MAX_IMAGE_FILE_SIZE_MB}
        MB. Cropped to a {getCropAspectLabel(kind)}.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_UPLOAD_ACCEPT}
        aria-label={`${KIND_TITLES[kind]} file`}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file)
          // Clear so choosing the same file again still fires a change.
          event.target.value = ''
        }}
      />
    </section>
  )
}

const ImageCropArea = ({
  kind,
  state,
  previewUrl,
  dispatch,
}: {
  readonly kind: RecordImageKind
  readonly state: CropState
  readonly previewUrl: string | null
  readonly dispatch: React.Dispatch<RecordImageUploadAction>
}) => {
  const dragRef = useRef<DragState | null>(null)
  const viewport = getCropViewportSize(kind)
  const isPending = state.status === 'pending'
  const box = state.imageSize
    ? getCropImageBox({
        imageSize: state.imageSize,
        kind,
        offset: state.offset,
        zoom: state.zoom,
      })
    : null

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (isPending || !state.imageSize) return
    const rect = event.currentTarget.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      origin: state.offset,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scale: rect.width > 0 ? viewport.width / rect.width : 1,
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (drag?.pointerId !== event.pointerId) return
    dispatch({
      type: 'moved',
      offset: {
        x: drag.origin.x + (event.clientX - drag.startX) * drag.scale,
        y: drag.origin.y + (event.clientY - drag.startY) * drag.scale,
      },
    })
  }

  const handlePointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const delta = getArrowKeyNudge(event.key)
    if (!delta) return
    event.preventDefault()
    dispatch({ type: 'nudged', delta })
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        aria-label="Reposition image. Drag it, or use the arrow keys."
        className={cn(
          'relative block w-full touch-none select-none overflow-hidden rounded-sm border border-border bg-muted outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          isPending ? 'cursor-wait' : 'cursor-grab active:cursor-grabbing',
        )}
        style={{
          aspectRatio: `${viewport.width} / ${viewport.height}`,
          maxWidth: viewport.width,
        }}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        {previewUrl ? (
          <img
            alt="Crop preview"
            src={previewUrl}
            draggable={false}
            className={cn(
              'absolute max-w-none -translate-x-1/2 -translate-y-1/2',
              !box && 'opacity-0',
            )}
            style={
              box
                ? {
                    height: `${box.height}%`,
                    left: `${box.x}%`,
                    top: `${box.y}%`,
                    width: `${box.width}%`,
                  }
                : undefined
            }
            onLoad={(event) =>
              dispatch({
                type: 'imageLoaded',
                imageSize: {
                  height: event.currentTarget.naturalHeight,
                  width: event.currentTarget.naturalWidth,
                },
              })
            }
            onError={() => dispatch({ type: 'imageFailed' })}
          />
        ) : null}
      </button>
      <div className="flex items-center gap-2 text-muted-foreground">
        <ZoomOut aria-hidden="true" className="size-4" />
        <input
          type="range"
          aria-label="Zoom"
          className="w-36 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          min={MIN_CROP_ZOOM}
          max={MAX_CROP_ZOOM}
          step={CROP_ZOOM_STEP}
          value={state.zoom}
          disabled={isPending || !state.imageSize}
          onChange={(event) =>
            dispatch({ type: 'zoomed', zoom: Number(event.target.value) })
          }
        />
        <ZoomIn aria-hidden="true" className="size-4" />
      </div>
      <Button
        variant="link"
        size="sm"
        disabled={isPending}
        onClick={() => dispatch({ type: 'back' })}
      >
        Choose a different image
      </Button>
    </div>
  )
}

/**
 * Picks, crops and previews an avatar or header image, then hands the cropped
 * JPEG to `onConfirm`. Mount it only while open: it calls `onClose` on cancel
 * and after `onConfirm` resolves, and shows a rejection so the user can retry.
 */
export const RecordImageUploadDialog = ({
  kind,
  mode,
  hasConflictingDraft,
  onConfirm,
  onClose,
}: RecordImageUploadDialogProps) => {
  const [state, dispatch] = useReducer(
    (current: RecordImageUploadState, action: RecordImageUploadAction) =>
      reduceRecordImageUpload(current, action, kind),
    INITIAL_RECORD_IMAGE_UPLOAD_STATE,
  )
  const previewUrl = useObjectUrl(state.step === 'crop' ? state.file : null)
  const isMountedRef = useIsMountedRef()
  const isConfirming = useRef(false)
  const isPending = state.step === 'crop' && state.status === 'pending'
  const copy = MODE_COPY[mode]

  const handleConfirm = async () => {
    if (state.step !== 'crop' || isConfirming.current || !state.imageSize)
      return
    isConfirming.current = true
    dispatch({ type: 'submitted' })
    const confirmUpload = ResultAsync.fromThrowable(
      onConfirm,
      (cause) => new RecordImageConfirmError({ cause }),
    )
    const result = await cropImageFile({
      file: state.file,
      imageSize: state.imageSize,
      kind,
      offset: state.offset,
      zoom: state.zoom,
    }).andThen((file) =>
      isMountedRef.current ? confirmUpload(file) : okAsync(undefined),
    )
    // The user may have cancelled while this was pending.
    isConfirming.current = false
    if (!isMountedRef.current) return
    result.match(onClose, (error) =>
      dispatch({ type: 'failed', error: getRecordImageErrorMessage(error) }),
    )
  }

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        aria-busy={isPending}
        // Escape, the close button and Cancel still cancel; a stray click
        // outside shouldn't drop an upload the wallet is waiting on.
        onInteractOutside={(event) => {
          if (isPending) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{KIND_TITLES[kind]}</DialogTitle>
          <DialogDescription>
            {state.step === 'crop'
              ? `Drag and zoom to frame the ${getCropAspectLabel(kind)}.`
              : `Choose an image for the ${kind} record.`}
          </DialogDescription>
        </DialogHeader>
        {state.step === 'crop' ? (
          <ImageCropArea
            kind={kind}
            state={state}
            previewUrl={previewUrl}
            dispatch={dispatch}
          />
        ) : (
          <ImageDropZone
            kind={kind}
            onFile={(file) => dispatch({ type: 'fileChosen', file })}
          />
        )}
        <p className="text-small text-muted-foreground">{copy.note}</p>
        {mode === 'replace' && hasConflictingDraft && (
          <p className="text-small text-muted-foreground">
            Replacing this image will clear the pending edit to this record.
          </p>
        )}
        {state.error ? (
          <p role="alert" className="text-small text-danger-text">
            {state.error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {state.step === 'crop' ? (
            <Button
              onClick={handleConfirm}
              disabled={isPending || !state.imageSize}
            >
              {isPending ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              {copy.cta}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
