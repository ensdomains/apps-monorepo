import type { PublicClient } from 'viem'
import { describe, expect, it } from 'vitest'
import { createActor } from 'xstate'
import { defaultProfileRecords } from '@/features/profile/utils/transformRecords'
import { editProfileDialogMachine } from './EditProfileDialog.machine'

describe('editProfileDialogMachine', () => {
  it('stays in idle editing when save prerequisites are missing', () => {
    const actor = createActor(editProfileDialogMachine, {
      input: { records: defaultProfileRecords },
    })
    actor.start()
    actor.send({ type: 'OPEN', records: defaultProfileRecords })

    actor.send({
      type: 'SAVE_REQUESTED',
      values: defaultProfileRecords,
      deps: {
        accountAddress: null,
        chainId: 1,
        name: 'test.eth',
        owner: undefined,
        ownerAddress: null,
        publicClient: {} as PublicClient,
        signer: null,
      },
    })

    const snapshot = actor.getSnapshot()
    expect(snapshot.matches({ editing: 'idle' })).toBe(true)
    expect(snapshot.context.pendingSave).toBeUndefined()
  })

  it('can show a general field without toggling it back off', () => {
    const actor = createActor(editProfileDialogMachine, {
      input: { records: defaultProfileRecords },
    })
    actor.start()
    actor.send({ type: 'OPEN', records: defaultProfileRecords })

    actor.send({ type: 'SHOW_GENERAL_FIELD', field: 'name' })
    actor.send({ type: 'SHOW_GENERAL_FIELD', field: 'name' })

    expect(actor.getSnapshot().context.visibleFields.has('name')).toBe(true)
  })
})
