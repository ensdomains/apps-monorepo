import { match } from 'ts-pattern'
import {
  type CropOffset,
  getConstrainedCropOffset,
  getImageFileError,
  type ImageSize,
  MAX_CROP_ZOOM,
  MIN_CROP_ZOOM,
  type RecordImageKind,
} from './recordImageCrop'

export type RecordImageUploadState =
  | { readonly step: 'select'; readonly error: string | null }
  | {
      readonly step: 'crop'
      readonly file: File
      readonly imageSize: ImageSize | null
      readonly offset: CropOffset
      readonly zoom: number
      readonly status: 'idle' | 'pending'
      readonly error: string | null
    }

export type RecordImageUploadAction =
  | { readonly type: 'fileChosen'; readonly file: File }
  | { readonly type: 'imageLoaded'; readonly imageSize: ImageSize }
  | { readonly type: 'imageFailed' }
  | { readonly type: 'moved'; readonly offset: CropOffset }
  | { readonly type: 'nudged'; readonly delta: CropOffset }
  | { readonly type: 'zoomed'; readonly zoom: number }
  | { readonly type: 'back' }
  | { readonly type: 'submitted' }
  | { readonly type: 'failed'; readonly error: string }

type CropState = Extract<RecordImageUploadState, { step: 'crop' }>

export const INITIAL_RECORD_IMAGE_UPLOAD_STATE: RecordImageUploadState = {
  step: 'select',
  error: null,
}

const CENTERED: CropOffset = { x: 0, y: 0 }
const NUDGE_STEP = 8

const ARROW_KEY_NUDGES: Readonly<Record<string, CropOffset>> = {
  ArrowDown: { x: 0, y: NUDGE_STEP },
  ArrowLeft: { x: -NUDGE_STEP, y: 0 },
  ArrowRight: { x: NUDGE_STEP, y: 0 },
  ArrowUp: { x: 0, y: -NUDGE_STEP },
}

/** Offset change for an arrow key on the crop area, or null for other keys. */
export const getArrowKeyNudge = (key: string): CropOffset | null =>
  ARROW_KEY_NUDGES[key] ?? null

const chooseFile = (file: File): RecordImageUploadState => {
  const error = getImageFileError(file)
  if (error) return { step: 'select', error }
  return {
    step: 'crop',
    file,
    imageSize: null,
    offset: CENTERED,
    zoom: MIN_CROP_ZOOM,
    status: 'idle',
    error: null,
  }
}

const reposition = (
  state: CropState,
  kind: RecordImageKind,
  offset: CropOffset,
  zoom: number,
): RecordImageUploadState =>
  state.imageSize
    ? {
        ...state,
        zoom,
        offset: getConstrainedCropOffset({
          imageSize: state.imageSize,
          kind,
          offset,
          zoom,
        }),
      }
    : state

const reduceCrop = (
  state: CropState,
  action: RecordImageUploadAction,
  kind: RecordImageKind,
): RecordImageUploadState =>
  match(action)
    .with({ type: 'fileChosen' }, ({ file }) => chooseFile(file))
    .with({ type: 'imageLoaded' }, ({ imageSize }) => ({
      ...state,
      imageSize,
      offset: CENTERED,
      zoom: MIN_CROP_ZOOM,
    }))
    .with({ type: 'imageFailed' }, () => ({
      step: 'select' as const,
      error: 'We couldn’t read this image. Try a different file.',
    }))
    .with({ type: 'moved' }, ({ offset }) =>
      reposition(state, kind, offset, state.zoom),
    )
    .with({ type: 'nudged' }, ({ delta }) =>
      reposition(
        state,
        kind,
        { x: state.offset.x + delta.x, y: state.offset.y + delta.y },
        state.zoom,
      ),
    )
    .with({ type: 'zoomed' }, ({ zoom }) =>
      reposition(
        state,
        kind,
        state.offset,
        Math.min(MAX_CROP_ZOOM, Math.max(MIN_CROP_ZOOM, zoom)),
      ),
    )
    .with({ type: 'back' }, () => INITIAL_RECORD_IMAGE_UPLOAD_STATE)
    .with({ type: 'submitted' }, () =>
      state.imageSize
        ? { ...state, status: 'pending' as const, error: null }
        : state,
    )
    .with({ type: 'failed' }, ({ error }) => ({
      ...state,
      status: 'idle' as const,
      error,
    }))
    .exhaustive()

/**
 * The upload dialog's steps. While an upload is pending the crop is frozen so
 * the image the user sees is the one being uploaded; a failure returns to idle
 * with the same crop so the user can retry.
 */
export const reduceRecordImageUpload = (
  state: RecordImageUploadState,
  action: RecordImageUploadAction,
  kind: RecordImageKind,
): RecordImageUploadState => {
  if (state.step === 'select') {
    return action.type === 'fileChosen' ? chooseFile(action.file) : state
  }
  if (state.status === 'pending' && action.type !== 'failed') return state
  return reduceCrop(state, action, kind)
}
