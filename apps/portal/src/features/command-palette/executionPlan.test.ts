import { describe, expect, it } from 'vitest'
import { PALETTE_COMMANDS } from './catalog'
import type {
  PaletteCommand,
  PaletteContext,
  PaletteEntity,
} from './core/types'
import { createExecutionPlan } from './executionPlan'

const ACCOUNT = '0x0000000000000000000000000000000000000001' as const
const run = (
  id: string,
  entity: PaletteEntity | null,
  overrides: Partial<PaletteContext> = {},
) => {
  const command = PALETTE_COMMANDS.find((item) => item.id === id)
  if (!command) throw new Error(`Missing live command: ${id}`)
  return createExecutionPlan({
    command,
    entity,
    origin: 'https://portal.example',
    context: {
      chainId: 1,
      developerEnabled: false,
      walletAddress: ACCOUNT,
      ...overrides,
    },
  })
}

describe('createExecutionPlan', () => {
  it('carries the explicitly selected target into renewal', () => {
    expect(
      run(
        'name.renew',
        { type: 'name', name: 'bob.eth' },
        {
          entity: { type: 'name', name: 'alice.eth' },
        },
      ),
    ).toEqual({
      status: 'ready',
      plan: { type: 'handoff', kind: 'renew', name: 'bob.eth' },
    })
  })

  it('retains a renewal target while requiring connection instead of substituting an account name', () => {
    expect(
      run(
        'name.renew',
        { type: 'name', name: 'bob.eth' },
        { walletAddress: undefined },
      ),
    ).toEqual({ status: 'needs-connection' })
  })

  it('blocks unsafe name-management spellings before requesting connection', () => {
    expect(
      run(
        'name.renew',
        { type: 'name', name: 'ALICE.eth' },
        { walletAddress: undefined },
      ).status,
    ).toBe('blocked')
  })

  it('copies a link to the selected entity without using route or wallet context', () => {
    expect(
      run('address.copy-link', { type: 'address', address: ACCOUNT }),
    ).toEqual({
      status: 'ready',
      plan: {
        type: 'copy',
        value: `https://portal.example/addr/${ACCOUNT}`,
        label: 'Portal link',
      },
    })
  })

  it('does not execute a developer operation merely because its command was supplied', () => {
    const command: PaletteCommand = {
      id: 'developer.test',
      title: 'Test',
      icon: 'developer',
      keywords: [],
      target: 'none',
      group: 'Developer',
      scope: 'developer',
      operation: { type: 'developer', tool: 'drawer' },
    }
    expect(
      createExecutionPlan({
        command,
        entity: null,
        origin: '',
        context: { chainId: 1, developerEnabled: false },
      }).status,
    ).toBe('blocked')
  })
})
