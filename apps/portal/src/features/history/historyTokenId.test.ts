import type { HistoryEventDataByType } from '@ens-apps/bigname'
import { describe, expect, it } from 'vitest'
import { historyTokenId } from './historyTokenId'
import type { HistoryEventType, TimelineEvent } from './timelineEvent'

// Sepolia emitters, as bigname serves them in `contract_address`.
const BASE_REGISTRAR = '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85'
const NAME_WRAPPER = '0x0635513f179d50a207757e05759cbd106d7dfce8'
const ENS_V2_ETH_REGISTRY = '0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4'
const ENS_V1_REGISTRY = '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e'
const HOLDER = '0xc0d86456f6f2930b892f3dad007cdbe32c081fe6'

// Shaped like live `GET /v1/names/{name}/history?include=data,raw` rows.
const row = <TType extends HistoryEventType>(
  type: TType,
  data: HistoryEventDataByType[TType],
  extra: Partial<Omit<TimelineEvent, 'type' | 'data'>>,
): TimelineEvent =>
  ({
    id: '1',
    type,
    name: 'envoy1084.eth',
    registrationId: null,
    transactionHash: '0xdb6015abc3',
    blockNumber: 1,
    logIndex: 43,
    timestamp: 1762252488,
    data,
    ...extra,
  }) as TimelineEvent

describe('historyTokenId', () => {
  it('reads a BaseRegistrar registration as the labelhash token', () => {
    const event = row(
      'registration',
      {
        action_role: 'registered',
        expires_at: '2077785288',
        registrant: '0x0635513f179d50a207757e05759cbd106d7dfce8',
      },
      { kind: 'RegistrationGranted', contractAddress: BASE_REGISTRAR },
    )
    expect(historyTokenId(event)).toEqual({
      contract: 'BaseRegistrar',
      // uint256(labelhash('envoy1084'))
      tokenId:
        '85527650159212779790354773742537435044869515479240792704213198141377375979258',
    })
  })

  it('reads a BaseRegistrar transfer the same way', () => {
    const event = row(
      'transfer',
      { from: HOLDER, to: '0x2a35b94df22cc7354570be2284655e2cdc0e64a2' },
      { kind: 'TokenControlTransferred', contractAddress: BASE_REGISTRAR },
    )
    expect(historyTokenId(event)?.contract).toBe('BaseRegistrar')
  })

  it('reads a NameWrapper row as the namehash token, subnames included', () => {
    const event = row(
      'transfer',
      { from: NAME_WRAPPER, fuses: 327680, to: HOLDER },
      {
        kind: 'TokenControlTransferred',
        name: 'test.ved.eth',
        contractAddress: NAME_WRAPPER,
      },
    )
    expect(historyTokenId(event)).toEqual({
      contract: 'NameWrapper',
      // uint256(namehash('test.ved.eth'))
      tokenId:
        '60427556022348799095175906765024008634686922822934210293445007985169357776381',
    })
  })

  it('matches the emitter case-insensitively', () => {
    const event = row(
      'transfer',
      { from: HOLDER, to: NAME_WRAPPER },
      { contractAddress: '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85' },
    )
    expect(historyTokenId(event)?.contract).toBe('BaseRegistrar')
  })

  it('reads a bracketed label as the labelhash it spells', () => {
    const hash =
      'bd16ef3c3e72e3c26f8168853cdaeb0fe6757ed92f31abfc66c73626440146fa'
    const event = row(
      'transfer',
      { from: HOLDER, to: NAME_WRAPPER },
      { name: `[${hash}].eth`, contractAddress: BASE_REGISTRAR },
    )
    expect(historyTokenId(event)?.tokenId).toBe(BigInt(`0x${hash}`).toString())
  })

  it('has none for an ENSv2 registry row: its token id carries a version history does not serve', () => {
    const transfer = row(
      'transfer',
      { from: HOLDER, to: '0x00a2895816e64f152ff81c8a931dc1bd9f5c3ce3' },
      { kind: 'TokenControlTransferred', contractAddress: ENS_V2_ETH_REGISTRY },
    )
    const registration = row(
      'registration',
      { action_role: 'registered', owner: HOLDER },
      { kind: 'RegistrationGranted', contractAddress: ENS_V2_ETH_REGISTRY },
    )
    expect(historyTokenId(transfer)).toBeUndefined()
    expect(historyTokenId(registration)).toBeUndefined()
  })

  it('has none for a row that is not about a token', () => {
    const authority = row(
      'authority',
      { owner: HOLDER },
      { kind: 'AuthorityTransferred', contractAddress: ENS_V1_REGISTRY },
    )
    const expiry = row(
      'expiry',
      { expires_at: '2077785288' },
      { kind: 'ExpiryChanged', contractAddress: BASE_REGISTRAR },
    )
    expect(historyTokenId(authority)).toBeUndefined()
    expect(historyTokenId(expiry)).toBeUndefined()
  })

  it('has none without a name or an emitter', () => {
    // `/v1/events` serves BaseRegistrar transfers of unknown labels with no name.
    const nameless = row(
      'transfer',
      { from: HOLDER, to: NAME_WRAPPER },
      { name: '', contractAddress: BASE_REGISTRAR },
    )
    const stateDerived = row('transfer', { to: HOLDER }, {})
    expect(historyTokenId(nameless)).toBeUndefined()
    expect(historyTokenId(stateDerived)).toBeUndefined()
  })

  it('has none for a BaseRegistrar row whose name is not a .eth second-level name', () => {
    const event = row(
      'transfer',
      { from: HOLDER, to: NAME_WRAPPER },
      { name: 'sub.envoy1084.eth', contractAddress: BASE_REGISTRAR },
    )
    expect(historyTokenId(event)).toBeUndefined()
  })
})
