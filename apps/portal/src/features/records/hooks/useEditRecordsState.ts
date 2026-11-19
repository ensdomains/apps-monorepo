import { useCallback, useMemo, useReducer } from 'react'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import type { RecordImageKind } from '@/features/records/helpers/recordImageCrop'
import {
  getRecordImageKind,
  type PreparedRecordImage,
} from '@/features/records/helpers/recordImageUpload'
import { transformPendingChangesToSetRecords } from '@/features/records/helpers/transformPendingChanges'
import {
  createAddressRecord,
  createNewRecord,
  type EditableRecord,
  getRecordId,
  isRecordSlotTaken,
  mergeRecordsWithChanges,
  type RecordType,
} from '@/utils/records/editRecordUtils'

type StagedRecordImage = {
  readonly recordId: string
  readonly upload: PreparedRecordImage
  readonly status: 'pending' | 'uploaded'
}

// ============================================================================
// State Types
// ============================================================================

export type EditRecordsState = {
  /** Records added by the user */
  newRecords: EditableRecord[]
  /** Map of record ID to edited value */
  editedValues: Map<string, string>
  /** Set of record IDs marked for deletion */
  deletedIds: Set<string>
  readonly stagedImages?: readonly StagedRecordImage[]
}

// ============================================================================
// Action Types (Discriminated Union)
// ============================================================================

export type EditRecordsAction =
  | {
      type: 'ADD_RECORD'
      recordType: RecordType
      key: string
      value: string
      readonly originalRecords: readonly NameRecord[]
    }
  | {
      readonly type: 'ADD_ADDRESS_RECORD'
      readonly coinType: number
      readonly key: string
      readonly value: string
      readonly originalRecords: readonly NameRecord[]
    }
  | { type: 'DELETE_RECORD'; record: EditableRecord }
  | {
      type: 'UPDATE_RECORD'
      record: EditableRecord
      newValue: string
      readonly originalRecords: readonly NameRecord[]
    }
  | {
      readonly type: 'STAGE_IMAGE'
      readonly upload: PreparedRecordImage
      readonly originalRecords: readonly NameRecord[]
      readonly newRecord: EditableRecord
    }
  | {
      readonly type: 'MARK_IMAGE_UPLOADED'
      readonly upload: PreparedRecordImage
    }
  | { readonly type: 'KEEP_HOSTED_IMAGE'; readonly kind: RecordImageKind }
  | { type: 'DISCARD_ALL' }

// ============================================================================
// Initial State
// ============================================================================

export const initialEditRecordsState: EditRecordsState = {
  newRecords: [],
  editedValues: new Map(),
  deletedIds: new Set(),
}

const getSavedImageId = (key: RecordImageKind) =>
  getRecordId({ type: 'text', key, value: '' })

const hasImageRecordDraft = (
  state: EditRecordsState,
  kind: RecordImageKind,
) => {
  const id = getSavedImageId(kind)
  return (
    state.editedValues.has(id) ||
    state.deletedIds.has(id) ||
    state.newRecords.some((record) => getRecordImageKind(record) === kind)
  )
}

const stageRecordImage = (
  state: EditRecordsState,
  {
    upload,
    originalRecords,
    newRecord,
  }: Extract<EditRecordsAction, { type: 'STAGE_IMAGE' }>,
): EditRecordsState => {
  const matchesKind = (record: NameRecord) =>
    record.type === 'text' && record.key === upload.kind
  // A new row wins over edits in the transaction encoder, even if it was added manually.
  const draft = state.newRecords.findLast(matchesKind)
  const saved = originalRecords.find(matchesKind)
  const recordId = getRecordId(draft ?? saved ?? newRecord)
  const existing = draft ? { ...draft, isNew: true } : saved
  const updated = existing
    ? editRecordsReducer(state, {
        type: 'UPDATE_RECORD',
        record: existing,
        newValue: upload.imageUrl,
        originalRecords,
      })
    : { ...state, newRecords: [...state.newRecords, newRecord] }

  return {
    ...updated,
    deletedIds: new Set(
      [...updated.deletedIds].filter((id) => id !== recordId),
    ),
    stagedImages: [
      ...(state.stagedImages ?? []).filter(
        (image) => image.upload.kind !== upload.kind,
      ),
      { recordId, upload, status: 'pending' },
    ],
  }
}

/** Stages `newRecord` unless a saved or staged row already writes its slot. */
const addNewRecord = (
  state: EditRecordsState,
  newRecord: EditableRecord,
  originalRecords: readonly NameRecord[],
): EditRecordsState => {
  const records = mergeRecordsWithChanges(
    originalRecords,
    state.newRecords,
    state.editedValues,
    state.deletedIds,
  )
  if (isRecordSlotTaken(records, newRecord)) return state
  return { ...state, newRecords: [...state.newRecords, newRecord] }
}

export const getPendingRecordImages = (
  state: EditRecordsState,
  originalRecords: readonly NameRecord[],
) => {
  if (!state.stagedImages?.length) return []

  const { texts = [] } = transformPendingChangesToSetRecords(
    originalRecords,
    state,
  )
  return state.stagedImages
    .filter(
      ({ status, upload }) =>
        status === 'pending' &&
        texts.some(
          ({ key, value }) => key === upload.kind && value === upload.imageUrl,
        ),
    )
    .map(({ upload }) => upload)
}

// ============================================================================
// Reducer (Pure Function)
// ============================================================================

export function editRecordsReducer(
  state: EditRecordsState,
  action: EditRecordsAction,
): EditRecordsState {
  switch (action.type) {
    case 'ADD_RECORD':
      return addNewRecord(
        state,
        createNewRecord(action.recordType, action.key, action.value),
        action.originalRecords,
      )

    case 'ADD_ADDRESS_RECORD':
      return addNewRecord(
        state,
        createAddressRecord(action.coinType, action.key, action.value),
        action.originalRecords,
      )

    case 'STAGE_IMAGE':
      return stageRecordImage(state, action)

    case 'MARK_IMAGE_UPLOADED': {
      return {
        ...state,
        stagedImages: state.stagedImages?.map((image) =>
          image.upload === action.upload
            ? { ...image, status: 'uploaded' }
            : image,
        ),
      }
    }

    case 'KEEP_HOSTED_IMAGE': {
      const { kind } = action
      if (!hasImageRecordDraft(state, kind)) return state
      const id = getSavedImageId(kind)
      const editedValues = new Map(state.editedValues)
      editedValues.delete(id)
      return {
        ...state,
        editedValues,
        deletedIds: new Set(
          [...state.deletedIds].filter((deleted) => deleted !== id),
        ),
        newRecords: state.newRecords.filter(
          (record) => getRecordImageKind(record) !== kind,
        ),
        stagedImages: state.stagedImages?.filter(
          (image) => image.upload.kind !== kind,
        ),
      }
    }

    case 'DELETE_RECORD': {
      const id = getRecordId(action.record)

      const stagedImages = state.stagedImages?.filter(
        (image) => image.recordId !== id,
      )

      // If it's a new record, remove it from newRecords
      if (action.record.isNew) {
        return {
          ...state,
          stagedImages,
          newRecords: state.newRecords.filter((r) => getRecordId(r) !== id),
        }
      }

      // Mark existing record for deletion and remove any pending edits
      const nextEditedValues = new Map(state.editedValues)
      nextEditedValues.delete(id)

      return {
        ...state,
        stagedImages,
        editedValues: nextEditedValues,
        deletedIds: new Set(state.deletedIds).add(id),
      }
    }

    case 'UPDATE_RECORD': {
      const id = getRecordId(action.record)

      // If it's a new record, update it in newRecords
      if (action.record.isNew) {
        return {
          ...state,
          newRecords: state.newRecords.map((r) =>
            getRecordId(r) === id ? { ...r, value: action.newValue } : r,
          ),
        }
      }

      // Find original value
      const originalRecord = action.originalRecords.find(
        (r) => getRecordId(r) === id,
      )
      const originalValue = originalRecord?.value ?? ''

      // If value matches original, remove from editedValues
      if (action.newValue === originalValue) {
        const nextEditedValues = new Map(state.editedValues)
        nextEditedValues.delete(id)
        return {
          ...state,
          editedValues: nextEditedValues,
        }
      }

      // Otherwise, track the edit
      return {
        ...state,
        editedValues: new Map(state.editedValues).set(id, action.newValue),
      }
    }

    case 'DISCARD_ALL': {
      return initialEditRecordsState
    }

    default: {
      // Exhaustive check - TypeScript will error if we miss a case
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

// ============================================================================
// Custom Hook
// ============================================================================

export function useEditRecordsState(originalRecords: readonly NameRecord[]) {
  const [state, dispatch] = useReducer(
    editRecordsReducer,
    initialEditRecordsState,
  )

  // Memoized merged records
  const records = useMemo(
    () =>
      mergeRecordsWithChanges(
        originalRecords,
        state.newRecords,
        state.editedValues,
        state.deletedIds,
      ),
    [originalRecords, state.newRecords, state.editedValues, state.deletedIds],
  )

  // Computed counts
  const changesCount =
    state.newRecords.length + state.editedValues.size + state.deletedIds.size
  const updatesCount = changesCount // For now, 1:1 mapping

  // Action dispatchers
  const addRecord = (recordType: RecordType, key: string, value: string) => {
    dispatch({ type: 'ADD_RECORD', recordType, key, value, originalRecords })
  }

  const addAddressRecord = (coinType: number, key: string, value: string) => {
    dispatch({
      type: 'ADD_ADDRESS_RECORD',
      coinType,
      key,
      value,
      originalRecords,
    })
  }

  const deleteRecord = (record: EditableRecord) => {
    dispatch({ type: 'DELETE_RECORD', record })
  }

  // useCallback needed because this is passed to EditRecordsTable's memoized columns
  const updateRecord = useCallback(
    (record: EditableRecord, newValue: string) => {
      dispatch({ type: 'UPDATE_RECORD', record, newValue, originalRecords })
    },
    [originalRecords],
  )

  const discardAll = () => {
    dispatch({ type: 'DISCARD_ALL' })
  }

  const stageImage = (upload: PreparedRecordImage) => {
    dispatch({
      type: 'STAGE_IMAGE',
      upload,
      originalRecords,
      newRecord: createNewRecord('text', upload.kind, upload.imageUrl),
    })
  }

  const markImageUploaded = (upload: PreparedRecordImage) => {
    dispatch({ type: 'MARK_IMAGE_UPLOADED', upload })
  }

  // Data for save operation
  const pendingChanges = useMemo(
    () => ({
      newRecords: state.newRecords,
      editedValues: state.editedValues,
      deletedIds: state.deletedIds,
    }),
    [state.newRecords, state.editedValues, state.deletedIds],
  )

  return {
    // State
    records,
    changesCount,
    updatesCount,
    pendingChanges,
    pendingImages: getPendingRecordImages(state, originalRecords),

    // Actions
    addRecord,
    addAddressRecord,
    deleteRecord,
    updateRecord,
    discardAll,
    stageImage,
    markImageUploaded,
    hasImageRecordDraft: (kind: RecordImageKind) =>
      hasImageRecordDraft(state, kind),
    keepHostedImage: (kind: RecordImageKind) =>
      dispatch({ type: 'KEEP_HOSTED_IMAGE', kind }),
  }
}
