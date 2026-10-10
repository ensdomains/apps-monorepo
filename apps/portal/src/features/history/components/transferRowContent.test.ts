import type { EventDataByType } from '@ens-apps/indexer/bigname'
import { describe, expect, it } from 'vitest'
import { mockHistoryTransferOperator } from '@/test-utils/bigname/bigname.mock'
import { type TimelineEventOfType, toTimelineEvents } from '../timelineEvent'
import { transferRowContent } from './transferRowContent'

const BASE_REGISTRAR = '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85'
const NAME_WRAPPER = '0x0635513f179d50a207757e05759cbd106d7dfce8'
const ENS_V2_ETH_REGISTRY = '0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4'
const HOLDER = '0xc0d86456f6f2930b892f3dad007cdbe32c081fe6'
const BUYER = '0x00a2895816e64f152ff81c8a931dc1bd9f5c3ce3'

// Shaped like live `TokenControlTransferred` rows.
const transfer = (
  data: EventDataByType['transfer'],
  extra: Partial<Omit<TimelineEventOfType<'transfer'>, 'type' | 'data'>>,
): TimelineEventOfType<'transfer'> => ({
  id: '1',
  type: 'transfer',
  kind: 'TokenControlTransferred',
  name: 'envoy1084.eth',
  registrationId: null,
  transactionHash: '0xabc',
  blockNumber: 1,
  logIndex: 0,
  timestamp: 1,
  data,
  ...extra,
})

describe('transferRowContent', () => {
  it('names the BaseRegistrar token a transfer moved', () => {
    expect(
      transferRowContent(
        transfer(
          { from: HOLDER, to: BUYER },
          { contractAddress: BASE_REGISTRAR },
        ),
      ),
    ).toEqual({
      label: 'transferred token ID',
      token: {
        contract: 'BaseRegistrar',
        tokenId:
          '85527650159212779790354773742537435044869515479240792704213198141377375979258',
      },
      recipient: BUYER,
    })
  })

  it('reads a NameWrapper row whose sender is the wrapper itself as a mint', () => {
    const content = transferRowContent(
      transfer(
        { from: NAME_WRAPPER, fuses: 327680, to: HOLDER },
        { name: 'test.ved.eth', contractAddress: NAME_WRAPPER },
      ),
    )
    expect(content?.label).toBe('minted token ID')
    expect(content?.token?.contract).toBe('NameWrapper')
    expect(content?.recipient).toBe(HOLDER)
  })

  it('reads a transfer with no sender as a mint', () => {
    expect(
      transferRowContent(
        transfer({ to: HOLDER }, { contractAddress: BASE_REGISTRAR }),
      )?.label,
    ).toBe('minted token ID')
  })

  it('keeps the plain wording on an ENSv2 row, whose token id is not derivable', () => {
    expect(
      transferRowContent(
        transfer(
          { from: HOLDER, to: BUYER },
          { contractAddress: ENS_V2_ETH_REGISTRY },
        ),
      ),
    ).toEqual({ label: 'transferred to', recipient: BUYER })
  })

  it('shows the token alone when the recipient is not an address', () => {
    expect(
      transferRowContent(
        transfer(
          { from: HOLDER, to: '0xnot-an-address' },
          { contractAddress: BASE_REGISTRAR },
        ),
      ),
    ).toEqual({
      label: 'transferred token ID',
      token: expect.objectContaining({ contract: 'BaseRegistrar' }),
    })
  })

  it('has nothing to say without a token or a recipient', () => {
    expect(
      transferRowContent(
        transfer({ from: HOLDER }, { contractAddress: ENS_V2_ETH_REGISTRY }),
      ),
    ).toBeUndefined()
  })
})

describe('transferRowContent', () => {
  it('names the token an ENSv2 transfer serves', () => {
    const [event] = toTimelineEvents([mockHistoryTransferOperator])
    expect(
      transferRowContent(event as TimelineEventOfType<'transfer'>),
    ).toEqual({
      label: 'transferred token ID',
      token: {
        contract: 'Registry',
        tokenId: mockHistoryTransferOperator.data.token_id,
      },
      recipient: mockHistoryTransferOperator.data.to,
    })
  })

  it('reads an ENSv2 mint by its served token', () => {
    expect(
      transferRowContent(
        transfer(
          { to: BUYER, token_id: '42' },
          { contractAddress: ENS_V2_ETH_REGISTRY },
        ),
      ),
    ).toEqual({
      label: 'minted token ID',
      token: { contract: 'Registry', tokenId: '42' },
      recipient: BUYER,
    })
  })
})
