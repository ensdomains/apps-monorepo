import { describe, expect, it } from 'vitest'
import { CaptureAdmission } from '../src/admission.js'

describe('capture admission', () => {
  it('rejects concurrent captures without maintaining a local queue', () => {
    const admission = new CaptureAdmission()
    const release = admission.acquire()

    expect(release).toBeTypeOf('function')
    expect(admission.acquire()).toBeUndefined()

    release?.()
    expect(admission.acquire()).toBeTypeOf('function')
  })
})
