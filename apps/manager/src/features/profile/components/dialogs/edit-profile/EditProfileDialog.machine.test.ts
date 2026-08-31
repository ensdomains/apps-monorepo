import type { Address, PublicClient, WalletClient } from 'viem'
import { describe, expect, it } from 'vitest'
import { createActor } from 'xstate'
import { defaultProfileRecords } from '@/features/profile/utils/transformRecords'
import {
  editProfileDialogMachine,
  type SaveDeps,
} from './EditProfileDialog.machine'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const OTHER_ACCOUNT = '0x2222222222222222222222222222222222222222' as Address
const RESOLVER = '0x3333333333333333333333333333333333333333' as Address

const walletClient = {
  account: { address: OWNER },
} as WalletClient

const startActor = (records = defaultProfileRecords) => {
  const actor = createActor(editProfileDialogMachine, { input: { records } })
  actor.start()
  actor.send({ type: 'OPEN', records })
  return actor
}

describe('editProfileDialogMachine', () => {
  it('stays in idle editing when save prerequisites are missing', () => {
    const actor = startActor()

    actor.send({
      type: 'SAVE_REQUESTED',
      values: defaultProfileRecords,
      deps: {
        chainId: 1,
        name: 'test.eth',
        owner: undefined,
        ownerAddress: null,
        publicClient: {} as PublicClient,
        walletClient: null,
      },
    })

    const snapshot = actor.getSnapshot()
    expect(snapshot.matches({ editing: 'idle' })).toBe(true)
    expect(snapshot.context.pendingSave).toBeUndefined()
  })

  it('can show a general field without toggling it back off', () => {
    const actor = startActor()

    actor.send({ type: 'SHOW_GENERAL_FIELD', field: 'name' })
    actor.send({ type: 'SHOW_GENERAL_FIELD', field: 'name' })

    expect(actor.getSnapshot().context.visibleFields.has('name')).toBe(true)
  })

  it('queues resolver setup as an owner-EOA save', () => {
    const actor = startActor()
    const eth = '0x4444444444444444444444444444444444444444'
    const nextRecords = {
      ...defaultProfileRecords,
      addresses: [{ coinType: 60, value: eth }],
    }

    actor.send({
      type: 'SAVE_REQUESTED',
      values: nextRecords,
      deps: {
        chainId: 11155111,
        name: 'transferred.eth',
        needsResolverSetup: true,
        owner: OWNER,
        ownerAddress: OWNER,
        publicClient: {} as PublicClient,
        walletClient,
      },
    })

    const snapshot = actor.getSnapshot()
    expect(snapshot.matches({ editing: 'saving' })).toBe(true)
    expect(snapshot.context.pendingSave).toMatchObject({
      kind: 'setup',
      name: 'transferred.eth',
      ownerAddress: OWNER,
      signer: { type: 'eoa', walletClient },
      ethAddressChanged: true,
      before: { texts: [], coins: [] },
      after: { coins: [{ coinType: 60, value: eth }] },
    })
  })

  it('passes the edited record diff to resolver setup', () => {
    const eth = '0x5555555555555555555555555555555555555555'
    const records = {
      ...defaultProfileRecords,
      resolverAddress: RESOLVER,
      addresses: [{ coinType: 60, value: eth }],
      base: { description: 'existing bio' },
    }
    const actor = startActor(records)

    actor.send({
      type: 'SAVE_REQUESTED',
      values: {
        ...records,
        base: { ...records.base, description: 'edited bio' },
      },
      deps: {
        chainId: 11155111,
        name: 'transferred.eth',
        needsResolverSetup: true,
        owner: OWNER,
        ownerAddress: OWNER,
        publicClient: {} as PublicClient,
        walletClient,
      },
    })

    const pendingSave = actor.getSnapshot().context.pendingSave
    expect(pendingSave).toMatchObject({
      kind: 'setup',
      ethAddressChanged: false,
      before: {
        texts: [{ key: 'description', value: 'existing bio' }],
        coins: [{ coinType: 60, value: eth }],
      },
      after: {
        texts: [{ key: 'description', value: 'edited bio' }],
        coins: [{ coinType: 60, value: eth }],
      },
    })
    if (pendingSave?.kind === 'setup') {
      expect(pendingSave.currentRecords.addresses).toEqual([])
      expect(pendingSave.currentRecords.base).toEqual({})
    }
  })

  it.each([
    ['no wallet', null],
    [
      'a wallet switched away from the owner',
      { account: { address: OTHER_ACCOUNT } } as WalletClient,
    ],
  ])('blocks resolver setup with %s', (_, setupWalletClient) => {
    const actor = startActor()

    actor.send({
      type: 'SAVE_REQUESTED',
      values: defaultProfileRecords,
      deps: {
        chainId: 11155111,
        name: 'transferred.eth',
        needsResolverSetup: true,
        owner: OWNER,
        ownerAddress: OWNER,
        publicClient: {} as PublicClient,
        walletClient: setupWalletClient,
      },
    })

    const snapshot = actor.getSnapshot()
    expect(snapshot.matches({ editing: 'idle' })).toBe(true)
    expect(snapshot.context.pendingSave).toBeUndefined()
  })

  const writableRecords = {
    ...defaultProfileRecords,
    resolverAddress: RESOLVER,
    addresses: [
      {
        coinType: 60,
        value: '0x5555555555555555555555555555555555555555',
      },
    ],
  }

  const startWritableUpdate = (deps: Partial<SaveDeps>) => {
    const actor = startActor(writableRecords)

    actor.send({
      type: 'SAVE_REQUESTED',
      values: { ...writableRecords, addresses: [] },
      deps: {
        chainId: 11155111,
        name: 'owned.eth',
        needsResolverSetup: false,
        owner: OWNER,
        ownerAddress: OWNER,
        publicClient: {} as PublicClient,
        ...deps,
      },
    })

    return actor.getSnapshot()
  }

  it('queues an in-place update as an owner-EOA transaction', () => {
    const snapshot = startWritableUpdate({ walletClient })

    expect(snapshot.matches({ editing: 'saving' })).toBe(true)
    expect(snapshot.context.pendingSave).toMatchObject({
      kind: 'update',
      params: {
        resolverAddress: RESOLVER,
        name: 'owned.eth',
        signer: { type: 'eoa', walletClient },
        accountAddress: OWNER,
      },
    })
  })

  it.each([
    ['no owner wallet', undefined],
    [
      'a wallet switched away from the owner',
      { account: { address: OTHER_ACCOUNT } } as WalletClient,
    ],
  ])('blocks an in-place update with %s', (_, updateWalletClient) => {
    const snapshot = startWritableUpdate({
      walletClient: updateWalletClient,
    })

    expect(snapshot.matches({ editing: 'idle' })).toBe(true)
    expect(snapshot.context.pendingSave).toBeUndefined()
  })
})
