import { describe, expect, it } from 'vitest'
import { parseEventData, toHistoryEvent } from './history'
import type { V2Event } from './types'

const TX = '0xa4435ccd6a6f28124906fb1022f6fc9f154e10b7a90790a41a56acde019a0785'
const TOKEN_ID =
  '105286035894157384190491929522901316734601555943154660220749822853699736698880'
const CONTEXT = { chainId: 11155111, roleContract: 'registry' } as const

// Rows recorded from Sepolia zigens for the registration of afasf.eth.
const event = (type: string, data: string): V2Event => ({
  id: `${TX}-117`,
  type,
  blockNumber: 12153842,
  transactionHash: TX,
  timestamp: 1794911784,
  contractAddress: '0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4',
  name: 'afasf.eth',
  namehash:
    '0xccf9e52d2de9c7f2c2792c4767522318d95cf7b7e79a3dea4db175b8545c8e1f',
  data,
})

describe('parseEventData', () => {
  it('keeps a uint256 exact instead of rounding it to a double', () => {
    expect(parseEventData(`{"tokenId":${TOKEN_ID},"value":1}`)).toEqual({
      tokenId: TOKEN_ID,
      value: 1,
    })
  })
})

describe('toHistoryEvent', () => {
  it.each([
    {
      case: 'a registry registration, as the registered twin',
      event: event(
        'LabelRegistered',
        `{"name":"afasf.eth","tokenId":${TOKEN_ID},"owner":"0xda53c38ffacb571f904587e46a8ebf3f5f45e945","expiry":1826469384}`,
      ),
      type: 'registration',
      kind: 'LabelRegistered',
      data: {
        action: 'registration_granted',
        owner: '0xda53c38ffacb571f904587e46a8ebf3f5f45e945',
        token_id: TOKEN_ID,
        expires_at: '1826469384',
        action_id: TX,
        action_role: 'registered',
      },
    },
    {
      case: 'the controller registration, as the linked twin with its payment',
      event: event(
        'NameRegistered',
        `{"label":"afasf","tokenId":${TOKEN_ID},"owner":"0xda53c38ffacb571f904587e46a8ebf3f5f45e945","paymentToken":"0x1c7d4b196cb0c7b01d743fbc6116a902379c7238","basePrice":0,"premium":5}`,
      ),
      type: 'registration',
      kind: 'NameRegistered',
      data: {
        action: 'registration_granted',
        owner: '0xda53c38ffacb571f904587e46a8ebf3f5f45e945',
        token_id: TOKEN_ID,
        payment_token: {
          chain_id: 11155111,
          address: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
        },
        base_cost: '0',
        premium: '5',
        cost: '5',
        action_id: TX,
        action_role: 'linked',
      },
    },
    {
      case: 'a mint, keeping the zero sender',
      event: event(
        'Transfer',
        `{"operator":"0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3","from":"0x0000000000000000000000000000000000000000","to":"0xda53c38ffacb571f904587e46a8ebf3f5f45e945","id":${TOKEN_ID},"value":1}`,
      ),
      type: 'transfer',
      kind: 'Transfer',
      data: {
        action: 'token_transferred',
        from: '0x0000000000000000000000000000000000000000',
        to: '0xda53c38ffacb571f904587e46a8ebf3f5f45e945',
        operator: '0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3',
        token_id: TOKEN_ID,
      },
    },
    {
      case: 'a role grant, decoded to powers',
      event: event(
        'EACRolesChanged',
        '{"resource":"0xe8c5c8d73378235ad4ededf465ddcc76c2789d9760ed41a210cc782700000000","account":"0xda53c38ffacb571f904587e46a8ebf3f5f45e945","oldRoleBitmap":"0x00","newRoleBitmap":"0x0000000000000000000000001110000000000000000000000000000001100000"}',
      ),
      type: 'permission',
      kind: 'EACRolesChanged',
      data: {
        action: 'permission_changed',
        address: '0xda53c38ffacb571f904587e46a8ebf3f5f45e945',
        grant_scope: { kind: 'registration', detail: {} },
        powers: [
          'set_subregistry',
          'set_resolver',
          'admin_set_subregistry',
          'admin_set_resolver',
          'can_transfer_admin',
        ],
        added_powers: [
          'set_subregistry',
          'set_resolver',
          'admin_set_subregistry',
          'admin_set_resolver',
          'can_transfer_admin',
        ],
        removed_powers: [],
      },
    },
    {
      case: 'a text record, in the record-key grammar',
      event: event(
        'TextUpdated',
        '{"namehash":"0xccf9e52d2de9c7f2c2792c4767522318d95cf7b7e79a3dea4db175b8545c8e1f","resolver":"0x5fea82d96b8dd71e33138c6cba615f8bcf088d3a","key":"avatar","value":"ipfs://x"}',
      ),
      type: 'record',
      kind: 'RecordChanged',
      data: {
        action: 'record_changed',
        key: 'text:avatar',
        value: 'ipfs://x',
        resolver: {
          chain_id: 11155111,
          address: '0x5fea82d96b8dd71e33138c6cba615f8bcf088d3a',
        },
        node: '0xccf9e52d2de9c7f2c2792c4767522318d95cf7b7e79a3dea4db175b8545c8e1f',
      },
    },
  ])('maps $case', ({ event: row, type, kind, data }) => {
    const mapped = toHistoryEvent(row, CONTEXT)

    expect(mapped).toMatchObject({
      name: 'afasf.eth',
      blockNumber: 12153842,
      timestamp: new Date(1794911784 * 1000),
      transactionHash: TX,
      type,
      kind,
    })
    expect(mapped?.data).toEqual(data)
  })

  it('marks a role change on the root resource as a root change', () => {
    const root = event(
      'EACRolesChanged',
      '{"resource":"0x0000000000000000000000000000000000000000000000000000000000000000","account":"0xda53c38ffacb571f904587e46a8ebf3f5f45e945","oldRoleBitmap":"0x01","newRoleBitmap":"0x00"}',
    )

    expect(toHistoryEvent(root, CONTEXT)).toMatchObject({
      kind: 'RootPermissionChanged',
      data: { grant_scope: { kind: 'root' }, removed_powers: ['registrar'] },
    })
  })

  it('drops an event type the screens never show', () => {
    expect(toHistoryEvent(event('CommitmentMade', '{}'), CONTEXT)).toBeNull()
  })
})
