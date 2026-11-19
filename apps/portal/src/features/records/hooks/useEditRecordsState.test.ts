import { describe, expect, it } from 'vitest'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import type { EditableRecord } from '@/utils/records/editRecordUtils'
import {
  type EditRecordsAction,
  type EditRecordsState,
  editRecordsReducer,
  getPendingRecordImages,
  initialEditRecordsState,
} from './useEditRecordsState'

describe('editRecordsReducer', () => {
  describe('ADD_RECORD', () => {
    it('adds a text record to newRecords', () => {
      const action: EditRecordsAction = {
        type: 'ADD_RECORD',
        originalRecords: [],
        recordType: 'text',
        key: 'name',
        value: 'John',
      }

      const result = editRecordsReducer(initialEditRecordsState, action)

      expect(result.newRecords).toHaveLength(1)
      expect(result.newRecords[0]).toMatchObject({
        type: 'text',
        key: 'name',
        value: 'John',
      })
      expect(result.newRecords[0]._uid).toBeDefined()
    })

    it('adds an address record with default coin type', () => {
      const action: EditRecordsAction = {
        type: 'ADD_RECORD',
        originalRecords: [],
        recordType: 'address',
        key: 'ETH',
        value: '0x123',
      }

      const result = editRecordsReducer(initialEditRecordsState, action)

      expect(result.newRecords[0]).toMatchObject({
        type: 'address',
        key: 'ETH',
        value: '0x123',
        id: 60,
      })
      expect(result.newRecords[0]._uid).toBeDefined()
    })

    it('adds a contentHash record', () => {
      const action: EditRecordsAction = {
        type: 'ADD_RECORD',
        originalRecords: [],
        recordType: 'contentHash',
        key: '',
        value: 'ipfs://abc',
      }

      const result = editRecordsReducer(initialEditRecordsState, action)

      expect(result.newRecords[0]).toMatchObject({
        type: 'contentHash',
        value: 'ipfs://abc',
      })
      expect(result.newRecords[0]._uid).toBeDefined()
    })

    it('preserves existing newRecords when adding', () => {
      const state: EditRecordsState = {
        ...initialEditRecordsState,
        newRecords: [{ type: 'text', key: 'existing', value: 'val' }],
      }

      const action: EditRecordsAction = {
        type: 'ADD_RECORD',
        originalRecords: [],
        recordType: 'text',
        key: 'new',
        value: 'newval',
      }

      const result = editRecordsReducer(state, action)

      expect(result.newRecords).toHaveLength(2)
      expect(result.newRecords[0]).toMatchObject({ key: 'existing' })
      expect(result.newRecords[1]).toMatchObject({ key: 'new' })
    })
  })

  describe('adding to a slot that already has a row', () => {
    const savedEth: NameRecord = {
      type: 'address',
      key: 'ETH',
      value: '0xsaved',
      id: 60,
    }
    const addEthereum = {
      type: 'ADD_ADDRESS_RECORD',
      coinType: 60,
      key: 'Ethereum',
      value: '0xnew',
      originalRecords: [savedEth],
    } as const satisfies EditRecordsAction

    it('keeps a saved ETH row the only coin type 60 slot when Ethereum is added', () => {
      expect(editRecordsReducer(initialEditRecordsState, addEthereum)).toBe(
        initialEditRecordsState,
      )
    })

    it('stages only the first of two rapid adds to the same slot', () => {
      const add = { ...addEthereum, originalRecords: [] }
      const result = [add, add].reduce(
        editRecordsReducer,
        initialEditRecordsState,
      )

      expect(result.newRecords).toEqual([
        expect.objectContaining({ id: 60, key: 'Ethereum', value: '0xnew' }),
      ])
    })

    it('re-adds a saved slot after it is deleted, which the encoder coalesces', () => {
      const deleted = editRecordsReducer(initialEditRecordsState, {
        type: 'DELETE_RECORD',
        record: savedEth,
      })

      expect(editRecordsReducer(deleted, addEthereum).newRecords).toEqual([
        expect.objectContaining({ id: 60, value: '0xnew' }),
      ])
    })
  })

  describe('ADD_ADDRESS_RECORD', () => {
    // A name lookup would turn Base Sepolia into mainnet Base and an unknown name into ETH.
    it.each([
      { key: 'Bitcoin', coinType: 0 },
      { key: 'Base Sepolia', coinType: 2147568180 },
    ])('stages $key with coin type $coinType', ({ key, coinType }) => {
      const result = editRecordsReducer(initialEditRecordsState, {
        type: 'ADD_ADDRESS_RECORD',
        originalRecords: [],
        coinType,
        key,
        value: '0x123',
      })

      expect(result.newRecords).toEqual([
        {
          type: 'address',
          key,
          value: '0x123',
          id: coinType,
          _uid: expect.any(String),
        },
      ])
    })
  })

  describe('DELETE_RECORD', () => {
    it('removes a new record from newRecords', () => {
      const newRecord: EditableRecord = {
        type: 'text',
        key: 'name',
        value: 'John',
        isNew: true,
      }
      const state: EditRecordsState = {
        ...initialEditRecordsState,
        newRecords: [newRecord],
      }

      const action: EditRecordsAction = {
        type: 'DELETE_RECORD',
        record: newRecord,
      }

      const result = editRecordsReducer(state, action)

      expect(result.newRecords).toHaveLength(0)
    })

    it('adds existing record ID to deletedIds', () => {
      const existingRecord: EditableRecord = {
        type: 'text',
        key: 'name',
        value: 'John',
      }

      const action: EditRecordsAction = {
        type: 'DELETE_RECORD',
        record: existingRecord,
      }

      const result = editRecordsReducer(initialEditRecordsState, action)

      expect(result.deletedIds.has('text-name')).toBe(true)
    })

    it('removes pending edits when deleting', () => {
      const existingRecord: EditableRecord = {
        type: 'text',
        key: 'name',
        value: 'John',
      }
      const state: EditRecordsState = {
        ...initialEditRecordsState,
        editedValues: new Map([['text-name', 'Jane']]),
      }

      const action: EditRecordsAction = {
        type: 'DELETE_RECORD',
        record: existingRecord,
      }

      const result = editRecordsReducer(state, action)

      expect(result.editedValues.has('text-name')).toBe(false)
      expect(result.deletedIds.has('text-name')).toBe(true)
    })
  })

  describe('UPDATE_RECORD', () => {
    const originalRecords: NameRecord[] = [
      { type: 'text', key: 'name', value: 'John' },
    ]

    it('updates a new record in newRecords', () => {
      const newRecord: EditableRecord = {
        type: 'text',
        key: 'bio',
        value: 'Hello',
        isNew: true,
      }
      const state: EditRecordsState = {
        ...initialEditRecordsState,
        newRecords: [newRecord],
      }

      const action: EditRecordsAction = {
        type: 'UPDATE_RECORD',
        record: newRecord,
        newValue: 'World',
        originalRecords,
      }

      const result = editRecordsReducer(state, action)

      expect(result.newRecords[0].value).toBe('World')
    })

    it('adds edit to editedValues for existing record', () => {
      const existingRecord: EditableRecord = {
        type: 'text',
        key: 'name',
        value: 'John',
      }

      const action: EditRecordsAction = {
        type: 'UPDATE_RECORD',
        record: existingRecord,
        newValue: 'Jane',
        originalRecords,
      }

      const result = editRecordsReducer(initialEditRecordsState, action)

      expect(result.editedValues.get('text-name')).toBe('Jane')
    })

    it('removes edit when value matches original', () => {
      const existingRecord: EditableRecord = {
        type: 'text',
        key: 'name',
        value: 'Jane', // Current edited value
      }
      const state: EditRecordsState = {
        ...initialEditRecordsState,
        editedValues: new Map([['text-name', 'Jane']]),
      }

      const action: EditRecordsAction = {
        type: 'UPDATE_RECORD',
        record: existingRecord,
        newValue: 'John', // Back to original
        originalRecords,
      }

      const result = editRecordsReducer(state, action)

      expect(result.editedValues.has('text-name')).toBe(false)
    })
  })

  describe('DISCARD_ALL', () => {
    it('resets state to initial', () => {
      const state: EditRecordsState = {
        newRecords: [{ type: 'text', key: 'name', value: 'John' }],
        editedValues: new Map([['text-bio', 'Hello']]),
        deletedIds: new Set(['text-avatar']),
      }

      const action: EditRecordsAction = { type: 'DISCARD_ALL' }

      const result = editRecordsReducer(state, action)

      expect(result).toEqual(initialEditRecordsState)
      expect(result.newRecords).toHaveLength(0)
      expect(result.editedValues.size).toBe(0)
      expect(result.deletedIds.size).toBe(0)
    })
  })
})

describe('staged record images', () => {
  const avatarUpload = {
    name: 'alice.eth',
    kind: 'avatar',
    imageUrl: 'https://euc.li/alice.eth',
    dataURL: 'image',
    hash: 'hash',
  } as const
  const newAvatar = {
    type: 'text',
    key: 'avatar',
    value: avatarUpload.imageUrl,
    _uid: 'avatar-draft',
  } as const
  const savedAvatar = {
    type: 'text',
    key: 'avatar',
    value: 'ipfs://avatar',
  } as const

  const stage = (
    state = initialEditRecordsState,
    originalRecords: NameRecord[] = [],
  ) =>
    editRecordsReducer(state, {
      type: 'STAGE_IMAGE',
      upload: avatarUpload,
      originalRecords,
      newRecord: newAvatar,
    })

  it('updates an existing draft for the key and preserves unrelated changes', () => {
    const draft = {
      ...newAvatar,
      _uid: 'existing-draft',
      value: 'ipfs://draft',
    }
    const editedValues = new Map([['text-name', 'Alice']])
    const state = stage(
      { ...initialEditRecordsState, newRecords: [draft], editedValues },
      [savedAvatar],
    )

    expect(state.newRecords).toEqual([
      { ...draft, value: avatarUpload.imageUrl },
    ])
    expect(state.editedValues).toEqual(editedValues)
    expect(getPendingRecordImages(state, [savedAvatar])).toEqual([avatarUpload])
  })

  it('restores a deleted saved record using a single edit', () => {
    const deleted = editRecordsReducer(initialEditRecordsState, {
      type: 'DELETE_RECORD',
      record: savedAvatar,
    })
    const staged = stage(deleted, [savedAvatar])

    expect(staged.newRecords).toEqual([])
    expect(staged.deletedIds.has('text-avatar')).toBe(false)
    expect(staged.editedValues.get('text-avatar')).toBe(avatarUpload.imageUrl)
    expect(getPendingRecordImages(staged, [savedAvatar])).toEqual([
      avatarUpload,
    ])
  })

  it.each([
    { type: 'DISCARD_ALL' },
    { type: 'DELETE_RECORD', record: { ...newAvatar, isNew: true } },
    {
      type: 'UPDATE_RECORD',
      record: { ...newAvatar, isNew: true },
      originalRecords: [],
      newValue: 'https://example.com/replacement.jpg',
    },
  ] satisfies readonly EditRecordsAction[])(
    'omits the staged image after $type supersedes its URL',
    (action) => {
      expect(
        getPendingRecordImages(editRecordsReducer(stage(), action), []),
      ).toEqual([])
    },
  )

  it('refuses a second avatar row while an upload is staged and keeps the upload', () => {
    const staged = stage()
    const added = editRecordsReducer(staged, {
      type: 'ADD_RECORD',
      recordType: 'text',
      key: 'avatar',
      value: 'ipfs://override',
      originalRecords: [],
    })

    expect(added).toBe(staged)
    expect(getPendingRecordImages(added, [])).toEqual([avatarUpload])
  })

  it('does not upload a completed draft again but uploads a newly staged image', () => {
    const staged = stage()
    const uploaded = editRecordsReducer(staged, {
      type: 'MARK_IMAGE_UPLOADED',
      upload: avatarUpload,
    })

    expect(getPendingRecordImages(uploaded, [])).toEqual([])
    expect(uploaded.newRecords).toEqual([newAvatar])
    expect(getPendingRecordImages(stage(uploaded), [])).toEqual([avatarUpload])
  })

  it('keeps the prepared upload when an edited URL returns to the hosted value', () => {
    const record = { ...newAvatar, isNew: true }
    const changed = editRecordsReducer(stage(), {
      type: 'UPDATE_RECORD',
      record,
      originalRecords: [],
      newValue: 'https://example.org/photo.jpg',
    })
    const restored = editRecordsReducer(changed, {
      type: 'UPDATE_RECORD',
      record,
      originalRecords: [],
      newValue: avatarUpload.imageUrl,
    })

    expect(getPendingRecordImages(restored, [])).toEqual([avatarUpload])
  })

  it.each([
    {
      type: 'UPDATE_RECORD',
      record: savedAvatar,
      originalRecords: [savedAvatar],
      newValue: 'ipfs://new',
    },
    { type: 'DELETE_RECORD', record: savedAvatar },
  ] satisfies readonly EditRecordsAction[])(
    'clears a conflicting $type when keeping the hosted image and preserves the other record',
    (action) => {
      const original = {
        ...initialEditRecordsState,
        editedValues: new Map([['text-name', 'Alice']]),
      }
      const conflict = editRecordsReducer(original, action)
      const resolved = editRecordsReducer(conflict, {
        type: 'KEEP_HOSTED_IMAGE',
        kind: 'avatar',
      })

      expect(resolved.editedValues).toEqual(original.editedValues)
      expect(resolved.deletedIds.size).toBe(0)
    },
  )
})
