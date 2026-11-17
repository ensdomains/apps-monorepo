import { describe, expect, it } from 'vitest'
import { nextConnectFlow } from './connectFlow'

describe('nextConnectFlow', () => {
  it('closes the picker on eager reconnection without starting the sign-in step', () => {
    expect(nextConnectFlow('choosing', 'reconnected')).toBe('closed')
  })

  it('does not open the dialog for a connection started outside it', () => {
    expect(nextConnectFlow('closed', 'connected')).toBe('closed')
  })
})
