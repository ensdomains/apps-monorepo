import type { Signer } from '@ens-apps/transaction-manager'
import type { Address, Hex, PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createActor } from 'xstate'
import type { ProfileRecords } from '../../types'
import { newEmptyProfileRecords } from '../../utils/transformRecords'
import type { SaveRecordsResult } from '../ProfileEdit.transactions'
import { saveRecords } from '../ProfileEdit.transactions'
import {
  type EditProfileDialogSnapshot,
  editProfileDialogMachine,
} from './EditProfileDialog.machine'
import type { GeneralField } from './EditProfileGeneralTab'
import { getDefaultVisibleFields } from './EditProfileGeneralTab'

vi.mock('../ProfileEdit.transactions', () => {
  return {
    RecordsValidationError: class RecordsValidationError extends Error {
      issues: { message: string }[]

      constructor(issues: { message: string }[]) {
        super(issues.map((issue) => issue.message).join('\n'))
        this.name = 'RecordsValidationError'
        this.issues = issues
      }
    },
    saveRecords: vi.fn(),
  }
})

const saveRecordsMock = vi.mocked(saveRecords)

const OWNER = '0x0000000000000000000000000000000000000001' as Address
const ACCOUNT = '0x0000000000000000000000000000000000000002' as Address
const RESOLVER = '0x0000000000000000000000000000000000000003' as Address
const SECOND_ADDRESS = '0x0000000000000000000000000000000000000004' as Address
const TX_HASH = '0xabc' as Hex
const SIGNER = { type: 'eoa' } as Signer
const PUBLIC_CLIENT = {} as PublicClient

const makeRecords = (
  overrides: Partial<ProfileRecords> = {},
): ProfileRecords => ({
  ...newEmptyProfileRecords(),
  resolverAddress: RESOLVER,
  ...overrides,
})

const sortedFields = (fields: ReadonlySet<GeneralField>) =>
  Array.from(fields).sort()

const startActor = (records = makeRecords()) => {
  const actor = createActor(editProfileDialogMachine, {
    input: { records },
  })
  actor.start()
  return actor
}

const saveDeps = {
  accountAddress: ACCOUNT,
  chainId: 1,
  name: 'example.eth',
  owner: OWNER,
  ownerAddress: OWNER,
  publicClient: PUBLIC_CLIENT,
  signer: SIGNER,
}

const waitForSnapshot = (
  actor: ReturnType<typeof startActor>,
  predicate: (snapshot: EditProfileDialogSnapshot) => boolean,
) =>
  new Promise<EditProfileDialogSnapshot>((resolve, reject) => {
    const current = actor.getSnapshot()
    if (predicate(current)) {
      resolve(current)
      return
    }

    const timeout = setTimeout(() => {
      subscription.unsubscribe()
      reject(new Error('Timed out waiting for snapshot'))
    }, 1000)

    const subscription = actor.subscribe((snapshot) => {
      if (!predicate(snapshot)) return

      clearTimeout(timeout)
      subscription.unsubscribe()
      resolve(snapshot)
    })
  })

describe('editProfileDialogMachine', () => {
  beforeEach(() => {
    saveRecordsMock.mockReset()
  })

  it('opens with fresh saved records and default visible fields', () => {
    const initialRecords = makeRecords({
      base: { name: 'Initial' },
    })
    const openedRecords = makeRecords({
      base: { description: 'Opened profile', language: 'en' },
    })
    const actor = startActor(initialRecords)

    actor.send({ type: 'OPEN', records: openedRecords })

    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toEqual({ editing: 'idle' })
    expect(snapshot.context.savedRecords).toEqual(openedRecords)
    expect(sortedFields(snapshot.context.visibleFields)).toEqual(
      sortedFields(getDefaultVisibleFields(openedRecords)),
    )
    expect(snapshot.context.localSaveError).toBeUndefined()
    expect(snapshot.context.txHash).toBeUndefined()
  })

  it('toggles general fields deterministically', () => {
    const actor = startActor()
    actor.send({ type: 'OPEN', records: makeRecords() })

    actor.send({ type: 'TOGGLE_GENERAL_FIELD', field: 'avatar' })
    expect(actor.getSnapshot().context.visibleFields.has('avatar')).toBe(false)

    actor.send({ type: 'TOGGLE_GENERAL_FIELD', field: 'avatar' })
    expect(actor.getSnapshot().context.visibleFields.has('avatar')).toBe(true)
  })

  it.each([
    {
      deps: { ...saveDeps, owner: undefined },
      errorMessage: 'Cannot save profile - ENS owner is not available.',
      label: 'owner',
      records: makeRecords(),
    },
    {
      deps: { ...saveDeps, signer: undefined },
      errorMessage: 'Account not ready. Please wait for wallet to connect.',
      label: 'account',
      records: makeRecords(),
    },
    {
      deps: saveDeps,
      errorMessage: 'Cannot save profile - resolver address is not available.',
      label: 'resolver',
      records: makeRecords({ resolverAddress: undefined }),
    },
  ])('reports a missing $label error without calling saveRecords', ({
    deps,
    errorMessage,
    records,
  }) => {
    const actor = startActor(records)
    const values = makeRecords({ base: { description: 'Changed' } })
    actor.send({ type: 'OPEN', records })

    actor.send({ type: 'SAVE_REQUESTED', deps, values })

    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toEqual({ editing: 'error' })
    expect(snapshot.context.localSaveError).toBe(errorMessage)
    expect(saveRecordsMock).not.toHaveBeenCalled()
  })

  it('saves records and stores the successful transaction result', async () => {
    const before = makeRecords({
      addresses: [{ coinType: 60, value: OWNER }],
    })
    const after = makeRecords({
      addresses: [{ coinType: 60, value: SECOND_ADDRESS }],
      base: { description: 'Updated' },
    })
    saveRecordsMock.mockResolvedValue({
      hash: TX_HASH,
      txId: 'tx-1',
    } as SaveRecordsResult)
    const actor = startActor(before)
    actor.send({ type: 'OPEN', records: before })

    actor.send({ type: 'SAVE_REQUESTED', deps: saveDeps, values: after })

    const snapshot = await waitForSnapshot(actor, (state) =>
      state.matches({ editing: 'success' }),
    )
    expect(saveRecordsMock).toHaveBeenCalledTimes(1)
    expect(snapshot.context.savedRecords).toEqual(after)
    expect(snapshot.context.txHash).toBe(TX_HASH)
    expect(snapshot.context.ethAddressChanged).toBe(true)
    expect(snapshot.context.localSaveError).toBeUndefined()

    actor.send({ type: 'CLOSE' })
    expect(actor.getSnapshot().value).toBe('closed')
  })

  it('surfaces save failures and keeps the last saved records unchanged', async () => {
    const before = makeRecords()
    const after = makeRecords({ base: { description: 'Updated' } })
    saveRecordsMock.mockRejectedValue(new Error('boom'))
    const actor = startActor(before)
    actor.send({ type: 'OPEN', records: before })

    actor.send({ type: 'SAVE_REQUESTED', deps: saveDeps, values: after })

    const snapshot = await waitForSnapshot(actor, (state) =>
      state.matches({ editing: 'error' }),
    )
    expect(snapshot.context.savedRecords).toEqual(before)
    expect(snapshot.context.localSaveError).toBe('boom')
    expect(snapshot.context.txHash).toBeUndefined()
  })
})
