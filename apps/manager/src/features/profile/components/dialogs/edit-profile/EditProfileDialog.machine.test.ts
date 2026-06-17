import { describe, expect, it } from 'vitest'
import { createActor } from 'xstate'
import { defaultProfileRecords } from '@/features/profile/utils/transformRecords'
import { editProfileDialogMachine } from './EditProfileDialog.machine'

describe('editProfileDialogMachine', () => {
  it('surfaces local-only save failures from the idle editing state', () => {
    const actor = createActor(editProfileDialogMachine, {
      input: { records: defaultProfileRecords },
    })
    actor.start()
    actor.send({ type: 'OPEN', records: defaultProfileRecords })

    actor.send({
      type: 'SAVE_FAILED',
      errorMessage: 'Image cache refresh failed',
    })

    const snapshot = actor.getSnapshot()
    expect(snapshot.matches({ editing: 'error' })).toBe(true)
    expect(snapshot.context.localSaveError).toBe('Image cache refresh failed')
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
