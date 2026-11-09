import { describe, expect, it } from 'vitest'
import { PALETTE_COMMANDS } from '../catalog'
import {
  getCommandResultId,
  getCommandsForScope,
  parsePaletteQuery,
  resolveCommandTarget,
  searchCommands,
  shouldSearchEntities,
} from './search'
import type { PaletteCommand, PaletteContext, PaletteEntity } from './types'

const WALLET_ADDRESS = '0x0000000000000000000000000000000000000001'
const OTHER_ADDRESS = '0x0000000000000000000000000000000000000002'
const CONTEXT: PaletteContext = {
  entity: { type: 'name', name: 'alice.eth' },
  walletAddress: WALLET_ADDRESS,
  chainId: 1,
  developerEnabled: true,
}

const run = (query: string, context: PaletteContext = CONTEXT) =>
  searchCommands({ commands: PALETTE_COMMANDS, query, context })

const findCommand = (id: string): PaletteCommand => {
  const command = PALETTE_COMMANDS.find((entry) => entry.id === id)
  if (!command) throw new Error(`Missing command ${id}`)
  return command
}

describe('searchCommands', () => {
  it.each([
    ['renew', 'name.renew'],
    ['extend', 'name.renew'],
    ['avatar', 'name.edit-records'],
    ['website', 'name.edit-records'],
    ['wallet name', 'wallet.primary-name'],
    ['add user', 'name.grant-role'],
    ['burn fuses', 'name.burn-fuses'],
  ])('maps the goal %s to its owning operation', (query, expectedId) => {
    expect(run(query).at(0)?.command.id).toBe(expectedId)
  })

  it('shows the chosen name on contextual actions and keeps a supplied target ahead of the page', () => {
    const result = searchCommands({
      commands: PALETTE_COMMANDS,
      query: 'renew',
      context: CONTEXT,
      entity: { type: 'name', name: 'bob.eth' },
    }).at(0)
    expect(result?.title).toBe('Renew bob.eth')
    expect(result?.entity).toEqual({ type: 'name', name: 'bob.eth' })
  })

  it('accepts an explicit target only after a known complete command phrase', () => {
    const result = run('renew bob.eth').at(0)
    expect(result?.command.id).toBe('name.renew')
    expect(result?.entity).toEqual({ type: 'name', name: 'bob.eth' })
    expect(run('renew ALICE.eth')).toEqual([])
    expect(run('please renew bob.eth')).toEqual([])
  })

  it('does not use context to outrank an exact requested command', () => {
    expect(run('my names').at(0)?.command.id).toBe('wallet.names')
    expect(run('view records').at(0)?.command.id).toBe('name.records')
  })

  it('keeps developer matches isolated even when tooling is enabled', () => {
    expect(run('migration')).toEqual([])
    const enabled = searchCommands({
      commands: PALETTE_COMMANDS,
      query: 'migration',
      scope: 'developer',
      context: CONTEXT,
    })
    expect(enabled.at(0)?.command.id).toBe('developer.migration')
    expect(
      searchCommands({
        commands: PALETTE_COMMANDS,
        query: 'migration',
        scope: 'developer',
        context: { ...CONTEXT, developerEnabled: false },
      }),
    ).toEqual([])
  })

  it('finds a fuzzy command without changing the command target', () => {
    const result = run('rnw').find(({ command }) => command.id === 'name.renew')
    expect(result?.entity).toEqual({ type: 'name', name: 'alice.eth' })
    expect(result?.title).toBe('Renew alice.eth')
  })
})

describe('query classification', () => {
  it.each([
    ['', false],
    ['renew', false],
    ['ren', true],
    ['renew.eth', true],
    ['>renew.eth', false],
    ['migration', true],
    ['renew bob.eth', false],
    [OTHER_ADDRESS, true],
  ])('entity lookup for %s is %s', (query, expected) => {
    expect(
      shouldSearchEntities({
        query,
        commands: PALETTE_COMMANDS,
        developerEnabled: true,
      }),
    ).toBe(expected)
  })

  it('strips a command-only prefix without changing the actual input text', () => {
    expect(parsePaletteQuery('  >  renew bob.eth  ')).toEqual({
      mode: 'commands',
      query: 'renew bob.eth',
    })
  })
})

describe('resolveCommandTarget', () => {
  it('never turns a wallet address into the target of a name operation', () => {
    expect(
      resolveCommandTarget({
        command: findCommand('name.renew'),
        context: { ...CONTEXT, entity: undefined },
      }),
    ).toEqual({ status: 'needs-target', target: 'name' })
  })

  it('requires a new target instead of falling back to the page when an explicit entity is incompatible', () => {
    expect(
      resolveCommandTarget({
        command: findCommand('name.renew'),
        context: CONTEXT,
        entity: { type: 'address', address: OTHER_ADDRESS },
      }),
    ).toEqual({ status: 'needs-target', target: 'name' })
  })

  it('distinguishes the wallet-scoped copy action from a selected address', () => {
    const entity: PaletteEntity = { type: 'address', address: OTHER_ADDRESS }
    expect(
      resolveCommandTarget({
        command: findCommand('wallet.copy-address'),
        context: CONTEXT,
        entity,
      }),
    ).toEqual({
      status: 'ready',
      entity: { type: 'address', address: WALLET_ADDRESS },
    })
    expect(
      resolveCommandTarget({
        command: findCommand('address.copy'),
        context: CONTEXT,
        entity,
      }),
    ).toEqual({ status: 'ready', entity })
  })

  it('asks for connection for a wallet-scoped action while leaving public navigation usable', () => {
    const context = { ...CONTEXT, walletAddress: undefined }
    expect(
      resolveCommandTarget({ command: findCommand('wallet.names'), context }),
    ).toEqual({ status: 'needs-wallet' })
    expect(
      resolveCommandTarget({ command: findCommand('name.records'), context }),
    ).toEqual({ status: 'ready', entity: CONTEXT.entity })
  })

  it('gives a new identity to a different action, target, or chain', () => {
    const command = findCommand('name.renew')
    const entity: PaletteEntity = { type: 'name', name: 'alice.eth' }
    const id = getCommandResultId(command, entity, 1)
    expect(
      getCommandResultId(command, { type: 'name', name: 'bob.eth' }, 1),
    ).not.toBe(id)
    expect(getCommandResultId(command, entity, 11155111)).not.toBe(id)
    expect(getCommandResultId(findCommand('name.records'), entity, 1)).not.toBe(
      id,
    )
  })

  it('excludes gated developer aliases from the command index itself', () => {
    expect(
      getCommandsForScope({
        commands: PALETTE_COMMANDS,
        scope: 'developer',
        developerEnabled: false,
      }),
    ).toEqual([])
  })
})
