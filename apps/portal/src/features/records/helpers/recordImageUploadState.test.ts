import { describe, expect, it } from 'vitest'
import {
  INITIAL_RECORD_IMAGE_UPLOAD_STATE,
  type RecordImageUploadAction,
  type RecordImageUploadState,
  reduceRecordImageUpload,
} from './recordImageUploadState'

const jpeg = new File(['x'], 'a.jpg', { type: 'image/jpeg' })

const run = (
  actions: readonly RecordImageUploadAction[],
  state: RecordImageUploadState = INITIAL_RECORD_IMAGE_UPLOAD_STATE,
) =>
  actions.reduce(
    (current, action) => reduceRecordImageUpload(current, action, 'avatar'),
    state,
  )

// 200x100 in the 168x168 avatar viewport: rendered 336x168, so x moves ±84.
const LOADED: readonly RecordImageUploadAction[] = [
  { type: 'fileChosen', file: jpeg },
  { type: 'imageLoaded', imageSize: { width: 200, height: 100 } },
]

describe('reduceRecordImageUpload', () => {
  it('stays on file selection with an error for an unsupported file', () => {
    const svg = new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' })

    expect(run([{ type: 'fileChosen', file: svg }])).toMatchObject({
      step: 'select',
      error: expect.stringMatching(/SVG/),
    })
  })

  it('freezes the crop while pending and keeps it for a retry after a failure', () => {
    const pending = run([
      ...LOADED,
      { type: 'moved', offset: { x: 40, y: 0 } },
      { type: 'submitted' },
    ])
    expect(
      run(
        [{ type: 'moved', offset: { x: -40, y: 0 } }, { type: 'back' }],
        pending,
      ),
    ).toBe(pending)

    expect(
      run([{ type: 'failed', error: 'User rejected the request.' }], pending),
    ).toMatchObject({
      step: 'crop',
      status: 'idle',
      offset: { x: 40, y: 0 },
      error: 'User rejected the request.',
    })
  })

  it('pulls the offset back inside the image when zooming out', () => {
    const zoomedIn = run([
      ...LOADED,
      { type: 'zoomed', zoom: 2 },
      { type: 'moved', offset: { x: 200, y: 100 } },
    ])
    expect(zoomedIn).toMatchObject({ offset: { x: 200, y: 84 } })

    expect(run([{ type: 'zoomed', zoom: 1 }], zoomedIn)).toMatchObject({
      offset: { x: 84, y: 0 },
    })
  })
})
