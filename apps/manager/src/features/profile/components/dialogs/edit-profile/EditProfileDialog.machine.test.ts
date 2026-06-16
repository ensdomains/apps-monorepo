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
})
