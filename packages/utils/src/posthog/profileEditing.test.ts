import { describe, expect, it, vi } from 'vitest'
import { createProfileEditingAnalytics } from './profileEditing'

const setup = () => {
  const track = vi.fn()
  const capture = vi.fn()
  const startOperation = vi.fn(() => ({ capture }))
  const createFlowId = vi.fn(() => 'editor')
  const editor = createProfileEditingAnalytics({
    track,
    startOperation,
    createFlowId,
  })
  return { editor, track, capture, startOperation, createFlowId }
}

describe('profile editing observations', () => {
  it('observes one edit per session and binds each retry when saving, not when opening', () => {
    const { editor, track, capture, startOperation } = setup()
    editor.open()
    editor.view()
    editor.view()
    editor.change()
    editor.change()
    expect(track.mock.calls).toEqual([
      ['profile:edit_view', { flow_id: 'editor' }],
      ['profile:edit_start', { flow_id: 'editor' }],
    ])
    expect(startOperation).not.toHaveBeenCalled()
    editor.startSave(1, 'records').fail('execution')
    const retry = editor.startSave(1, 'records')
    retry.complete()
    retry.complete()
    expect(startOperation).toHaveBeenCalledTimes(2)
    expect(capture.mock.calls).toEqual([
      ['profile:save_start', { flow_id: 'editor', chain_id: 1 }],
      [
        'profile:save_fail',
        {
          flow_id: 'editor',
          chain_id: 1,
          stage: 'execution',
          is_retryable: true,
        },
      ],
      ['profile:save_start', { flow_id: 'editor', chain_id: 1 }],
      [
        'profile:save_complete',
        { flow_id: 'editor', chain_id: 1, save_type: 'records' },
      ],
    ])
  })

  it('suppresses failure callbacks after a completed image save and preserves a captured attempt across reopen', () => {
    const { editor, capture, createFlowId } = setup()
    createFlowId
      .mockReturnValueOnce('editor')
      .mockReturnValueOnce('next-editor')
    editor.open('Alice.ETH')
    const pending = editor.startSave(1, 'image')
    editor.open('bob.eth')
    pending.complete()
    pending.fail('image_upload')
    expect(capture.mock.calls).toEqual([
      [
        'profile:save_start',
        { flow_id: 'editor', chain_id: 1, ens_name: 'alice.eth' },
      ],
      [
        'profile:save_complete',
        {
          flow_id: 'editor',
          chain_id: 1,
          ens_name: 'alice.eth',
          save_type: 'image',
        },
      ],
    ])
  })

  it('leaves saving operational when correlation cannot be created', () => {
    const track = vi.fn()
    const capture = vi.fn()
    const startOperation = vi.fn(() => ({ capture }))
    const editor = createProfileEditingAnalytics({
      track,
      startOperation,
      createFlowId: () => undefined,
    })
    editor.open()
    editor.change()
    const attempt = editor.startSave(1, 'records')
    attempt.capture('profile:records_update', { chain_id: 1 })
    attempt.complete()
    expect(track).not.toHaveBeenCalled()
    expect(capture.mock.calls).toEqual([
      ['profile:records_update', { chain_id: 1 }],
    ])
  })
  it('contains capture, identity-binding and ID failures without interrupting an editor action', () => {
    const fail = () => {
      throw new Error('unavailable')
    }
    const editor = createProfileEditingAnalytics({
      track: fail,
      startOperation: fail,
      createFlowId: () => 'editor',
    })
    expect(() => {
      editor.open()
      editor.view()
      editor.change()
      editor.startSave(1, 'records').complete()
    }).not.toThrow()
    const unavailable = createProfileEditingAnalytics({
      track: fail,
      startOperation: fail,
      createFlowId: fail,
    })
    expect(() => unavailable.open()).not.toThrow()
  })
})
