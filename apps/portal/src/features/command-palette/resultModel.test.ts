import { describe, expect, it, vi } from 'vitest'
import type { UseSearchResultsReturn } from '@/features/dashboard/hooks/useSearchResults'
import type { Suggestion } from '@/features/dashboard/utils/buildSearchSuggestions'
import { PALETTE_COMMANDS } from './catalog'
import type { PageCommand } from './context'
import type { RecentEntity } from './core/recents'
import type { PaletteFrame } from './core/state'
import type { PaletteContext, PaletteTargetMetadata } from './core/types'
import { visibleSearchResults } from './presentation'
import type { PaletteRelatedEntity } from './relatedEntities'
import {
  buildPaletteRows,
  getRowEnterLabel,
  getSecondaryRow,
} from './resultModel'

const ALICE = { type: 'name', name: 'alice.eth' } as const
const BOB = { type: 'name', name: 'bob.eth' } as const
const ADDRESS = '0x0000000000000000000000000000000000000001'

const makeSuggestion = (name: string): Suggestion => ({
  id: `name:${name}`,
  label: name,
  inputValue: name,
  description: 'View name',
  action: () => {},
})

const makeData = (
  overrides: Partial<UseSearchResultsReturn> = {},
): UseSearchResultsReturn => ({
  suggestions: [],
  ownerBySuggestionId: new Map(),
  offchainNameIds: new Set(),
  failedOwnerIds: new Set(),
  failedAvailabilityIds: new Set(),
  failedRecordsIds: new Set(),
  nameVerificationBySuggestionId: new Map(),
  availableNames: [],
  pendingAvailabilityIds: new Set(),
  ownedNamesFiltered: [],
  ownedNameSuggestions: [],
  isOwnedNamesLoading: false,
  hasOwnedNamesError: false,
  allItems: [],
  isTldsLoading: false,
  hasAnySection: false,
  searchNotice: null,
  ...overrides,
})

const makeFrame = (overrides: Partial<PaletteFrame> = {}): PaletteFrame => ({
  screen: { type: 'root' },
  query: '',
  selectedId: '',
  scrollTop: 0,
  ...overrides,
})

const run = ({
  frame = makeFrame(),
  context = { chainId: 1, developerEnabled: false },
  data = makeData(),
  recents = [],
  pageCommands = [],
  targetMetadata,
  related,
}: {
  readonly frame?: PaletteFrame
  readonly context?: PaletteContext
  readonly data?: UseSearchResultsReturn
  readonly recents?: readonly RecentEntity[]
  readonly pageCommands?: readonly PageCommand[]
  readonly targetMetadata?: PaletteTargetMetadata
  readonly related?: readonly PaletteRelatedEntity[]
} = {}) =>
  buildPaletteRows({
    frame,
    context,
    data,
    recents,
    pageCommands,
    targetMetadata,
    related,
  })

const commandIds = (rows: ReturnType<typeof run>) =>
  rows.flatMap(({ action }) =>
    action.type === 'command' ? [action.command.id] : [],
  )

describe('buildPaletteRows', () => {
  it('curates a confirmed available name to inspection, registration, and copy actions', () => {
    const rows = run({
      frame: makeFrame({ screen: { type: 'entity', entity: ALICE } }),
      targetMetadata: {
        entity: ALICE,
        protocolVersion: 'ENSv2',
        isAvailable: true,
      },
    })
    expect(commandIds(rows).toSorted()).toEqual([
      'name.copy',
      'name.copy-link',
      'name.copy-namehash',
      'name.register',
      'name.view',
    ])
  })

  it.each([undefined, false])(
    'withholds entity-scope registration until availability is confirmed: %s',
    (isAvailable) => {
      const rows = run({
        frame: makeFrame({ screen: { type: 'entity', entity: ALICE } }),
        targetMetadata: { entity: ALICE, isAvailable },
      })
      expect(commandIds(rows)).not.toContain('name.register')
    },
  )

  it.each([
    ['ENSv1', false, true],
    ['ENSv2', true, false],
    [undefined, true, true],
  ] as const)(
    'uses known protocol %s to omit irrelevant roles and fuse destinations',
    (protocolVersion, hasRoles, hasFuses) => {
      const ids = commandIds(
        run({
          frame: makeFrame({ screen: { type: 'entity', entity: ALICE } }),
          targetMetadata: {
            entity: ALICE,
            protocolVersion,
            isAvailable: false,
          },
        }),
      )
      expect(ids.includes('name.grant-role')).toBe(hasRoles)
      expect(ids.includes('name.roles')).toBe(hasRoles)
      expect(ids.includes('name.fuses')).toBe(hasFuses)
      expect(ids.includes('name.burn-fuses')).toBe(hasFuses)
    },
  )

  it('uses renewal and DNS feature predicates while retaining generic action discovery', () => {
    const subname = { type: 'name', name: 'child.alice.eth' } as const
    const dnsName = { type: 'name', name: 'alice.xyz' } as const
    const unsafeName = { type: 'name', name: 'ALICE.eth' } as const
    const subnameIds = commandIds(
      run({
        frame: makeFrame({ screen: { type: 'entity', entity: subname } }),
      }),
    )
    const dnsIds = commandIds(
      run({
        frame: makeFrame({ screen: { type: 'entity', entity: dnsName } }),
      }),
    )
    const ethIds = commandIds(
      run({ frame: makeFrame({ screen: { type: 'entity', entity: ALICE } }) }),
    )
    const unsafeIds = commandIds(
      run({
        frame: makeFrame({ screen: { type: 'entity', entity: unsafeName } }),
      }),
    )
    expect(subnameIds).not.toContain('name.renew')
    expect(dnsIds).not.toContain('name.renew')
    expect(dnsIds).toContain('name.import-dns')
    expect(ethIds).toContain('name.renew')
    expect(ethIds).not.toContain('name.import-dns')
    expect(unsafeIds).not.toContain('name.renew')
    expect(unsafeIds).toContain('name.edit-records')
    const genericRows = run({
      context: { chainId: 1, developerEnabled: false, entity: ALICE },
      frame: makeFrame({ query: 'renew' }),
      targetMetadata: { entity: ALICE, isAvailable: true },
    })
    expect(commandIds(genericRows)).toContain('name.renew')
    expect(
      genericRows.some(({ action }) => action.type === 'another-target'),
    ).toBe(true)
  })

  it('applies known target facts to current-page empty shortcuts while preserving generic navigation', () => {
    const rows = run({
      context: {
        chainId: 1,
        developerEnabled: false,
        entity: ALICE,
        walletAddress: ADDRESS,
      },
      targetMetadata: { entity: ALICE, isAvailable: true },
    })
    expect(rows.filter(({ group }) => group === 'Current name')).toEqual([])
    expect(commandIds(rows)).toContain('name.register')
    expect(commandIds(rows)).toContain('navigation.dashboard')
  })

  it('does not apply another entity’s cached availability or protocol to the selected target', () => {
    const ids = commandIds(
      run({
        frame: makeFrame({ screen: { type: 'entity', entity: BOB } }),
        targetMetadata: {
          entity: ALICE,
          protocolVersion: 'ENSv2',
          isAvailable: true,
        },
      }),
    )
    expect(ids).toContain('name.renew')
    expect(ids).not.toContain('name.register')
    expect(ids).toContain('name.fuses')
  })

  it('offers connection without filling a first-visit empty state with personal destinations', () => {
    const ids = commandIds(run())
    expect(ids).toContain('wallet.connect')
    expect(ids).toContain('name.register')
    expect(ids).not.toContain('wallet.names')
    expect(ids).not.toContain('wallet.primary-name')
    expect(
      commandIds(run({ frame: makeFrame({ query: 'primary' }) })),
    ).toContain('wallet.primary-name')
  })

  it('puts an explicit name first while an action query favors its matching command and keeps a name escape hatch', () => {
    const data = makeData({ suggestions: [makeSuggestion('renew.eth')] })
    const entityRows = run({ frame: makeFrame({ query: 'renew.eth' }), data })
    expect(entityRows[0]?.action).toEqual({
      type: 'view',
      entity: { type: 'name', name: 'renew.eth' },
      resolver: false,
    })

    const actionRows = run({ frame: makeFrame({ query: 'renew' }), data })
    expect(actionRows[0]?.action).toEqual({
      type: 'command',
      command: PALETTE_COMMANDS.find(({ id }) => id === 'name.renew'),
      entity: undefined,
    })
    expect(
      actionRows.find(({ action }) => action.type === 'query')?.action,
    ).toEqual({ type: 'query', query: 'renew.eth' })
  })

  it.each(['>renew', '>'])(
    'keeps %s free of entity results even when matching entity data is cached',
    (query) => {
      const rows = run({
        frame: makeFrame({ query }),
        data: makeData({ suggestions: [makeSuggestion('renew.eth')] }),
        recents: [{ entity: BOB, chainId: 1, visitedAt: 100 }],
      })
      expect(
        rows.filter(
          ({ action }) =>
            action.type === 'view' ||
            action.type === 'actions' ||
            action.type === 'query',
        ),
      ).toEqual([])
      expect(commandIds(rows)).toContain('name.renew')
    },
  )

  it('orders a curated empty state as current actions, recents, then navigation', () => {
    const rows = run({
      context: {
        chainId: 1,
        developerEnabled: false,
        entity: ALICE,
        walletAddress: ADDRESS,
      },
      recents: [{ entity: BOB, chainId: 1, visitedAt: 100 }],
    })
    const currentIndex = rows.findIndex(({ group }) => group === 'Current name')
    const recentIndex = rows.findIndex(
      ({ action }) =>
        action.type === 'view' &&
        action.entity.type === 'name' &&
        action.entity.name === BOB.name,
    )
    const navigationIndex = rows.findIndex(
      ({ action }) =>
        action.type === 'command' &&
        action.command.id === 'navigation.dashboard',
    )
    expect(currentIndex).toBe(0)
    expect(recentIndex).toBeGreaterThan(currentIndex)
    expect(navigationIndex).toBeGreaterThan(recentIndex)
    expect(
      rows.filter(({ group }) => group === 'Current name').length,
    ).toBeLessThanOrEqual(3)
  })

  it('keeps visitors focused on inspection rather than unavailable management shortcuts', () => {
    const ids = commandIds(
      run({ context: { chainId: 1, developerEnabled: false, entity: ALICE } }),
    )
    expect(ids).toContain('name.records')
    expect(ids).toContain('name.history')
    expect(ids).not.toContain('name.edit-records')
    expect(ids).not.toContain('name.renew')
  })

  it('binds actions to an explicitly scoped entity and uses selection semantics in an action-first picker', () => {
    const context: PaletteContext = {
      chainId: 1,
      developerEnabled: false,
      entity: ALICE,
    }
    const entityRows = run({
      context,
      frame: makeFrame({
        screen: { type: 'entity', entity: BOB },
        query: 'renew',
      }),
    })
    const renewal = entityRows.find(
      ({ action }) =>
        action.type === 'command' && action.command.id === 'name.renew',
    )
    expect(renewal?.action).toEqual({
      type: 'command',
      command: PALETTE_COMMANDS.find(({ id }) => id === 'name.renew'),
      entity: BOB,
    })

    const pickerRows = run({
      context,
      frame: makeFrame({
        screen: { type: 'target', commandId: 'name.renew', target: 'name' },
        query: BOB.name,
      }),
      data: makeData({ suggestions: [makeSuggestion(BOB.name)] }),
    })
    expect(pickerRows.map(({ action }) => action)).toEqual([
      { type: 'pick', entity: BOB },
    ])
  })

  it('uses cached personal names in an empty picker while allowing arbitrary-name results after portfolio failure', () => {
    const picker = makeFrame({
      screen: { type: 'target', commandId: 'name.renew', target: 'name' },
    })
    const cached = makeData({ ownedNameSuggestions: [{ name: ALICE.name }] })
    const emptyRows = run({
      frame: picker,
      data: visibleSearchResults(cached, '', true),
    })
    expect(emptyRows.map(({ action }) => action)).toEqual([
      { type: 'pick', entity: ALICE },
    ])

    const failedPortfolio = makeData({
      hasOwnedNamesError: true,
      suggestions: [makeSuggestion(BOB.name)],
    })
    const rows = run({
      frame: { ...picker, query: BOB.name },
      data: failedPortfolio,
    })
    expect(rows.map(({ action }) => action)).toEqual([
      { type: 'pick', entity: BOB },
    ])
  })

  it('offers recent names in an empty action-first picker without binding the current page', () => {
    const rows = run({
      frame: makeFrame({
        screen: { type: 'target', commandId: 'name.renew', target: 'name' },
      }),
      recents: [{ entity: BOB, chainId: 1, visitedAt: 100 }],
      context: { entity: ALICE, chainId: 1, developerEnabled: false },
    })
    expect(rows.map(({ title, action }) => ({ title, action }))).toEqual([
      { title: 'bob.eth', action: { type: 'pick', entity: BOB } },
    ])
  })

  it('offers the connected wallet as an explicit address-picker target', () => {
    const rows = run({
      frame: makeFrame({
        screen: {
          type: 'target',
          commandId: 'address.names',
          target: 'address',
        },
      }),
      context: { walletAddress: ADDRESS, chainId: 1, developerEnabled: false },
    })
    expect(rows.map(({ action }) => action)).toEqual([
      { type: 'pick', entity: { type: 'address', address: ADDRESS } },
    ])
  })

  it('prioritizes common entity actions over technical destinations without changing explicit searches', () => {
    const screen = { type: 'entity', entity: ALICE } as const
    expect(
      run({ frame: makeFrame({ screen }) })
        .filter(({ group }) => group === 'Suggested')
        .map(({ action }) =>
          action.type === 'command' ? action.command.id : action.type,
        ),
    ).toEqual([
      'name.renew',
      'name.edit-records',
      'name.create-subname',
      'name.transfer',
    ])
    expect(
      commandIds(run({ frame: makeFrame({ screen, query: 'burn fuses' }) })),
    ).toEqual(['name.burn-fuses'])
  })

  it('keeps the entity view destination first when relationships arrive', () => {
    const frame = makeFrame({ screen: { type: 'entity', entity: ALICE } })
    const initial = run({ frame }).at(0)
    const enriched = run({
      frame,
      related: [{ entity: BOB, relations: ['parent'] }],
    }).at(0)
    expect(initial?.action).toMatchObject({
      type: 'command',
      command: { id: 'name.view' },
      entity: ALICE,
    })
    expect(enriched?.id).toBe(initial?.id)
  })

  it('deduplicates a target address that is also recognized as a resolver', () => {
    const makeAddress = (type: 'address' | 'resolver'): Suggestion => ({
      id: `${type}:${ADDRESS}`,
      inputValue: ADDRESS,
      label: ADDRESS,
      description: `View ${type}`,
      action: () => {},
    })
    const rows = run({
      frame: makeFrame({
        screen: {
          type: 'target',
          commandId: 'address.view',
          target: 'address',
        },
        query: ADDRESS,
      }),
      data: makeData({
        suggestions: [makeAddress('address'), makeAddress('resolver')],
      }),
    })
    expect(rows.map(({ action }) => action)).toEqual([
      { type: 'pick', entity: { type: 'address', address: ADDRESS } },
    ])
  })

  it('isolates developer commands from normal results and withholds them when the environment is gated out', () => {
    const enabled: PaletteContext = { chainId: 1, developerEnabled: true }
    const normal = run({
      context: enabled,
      frame: makeFrame({ query: 'migration' }),
    })
    expect(commandIds(normal)).not.toContain('developer.migration')
    const developer = run({
      context: enabled,
      frame: makeFrame({ screen: { type: 'developer' }, query: 'migration' }),
    })
    expect(commandIds(developer)).toContain('developer.migration')
    expect(
      commandIds(developer).every((id) => id.startsWith('developer.')),
    ).toBe(true)
    const gated = run({
      frame: makeFrame({ screen: { type: 'developer' }, query: 'migration' }),
    })
    expect(gated).toEqual([])
  })

  it('matches page commands only in their declared normal or developer scope', () => {
    const normal: PageCommand = {
      id: 'select-expiring',
      title: 'Select expiring names',
      keywords: ['expiring'],
      onSelect: vi.fn(),
    }
    const developer: PageCommand = {
      id: 'sample-records',
      title: 'Load sample records',
      keywords: ['sample'],
      scope: 'developer',
      onSelect: vi.fn(),
    }
    const context: PaletteContext = { chainId: 1, developerEnabled: true }
    const normalRows = run({
      context,
      frame: makeFrame({ query: 'expiring' }),
      pageCommands: [normal, developer],
    })
    expect(
      normalRows
        .filter(({ action }) => action.type === 'page')
        .map(({ action }) => action),
    ).toEqual([{ type: 'page', command: normal }])
    const developerRows = run({
      context,
      frame: makeFrame({ screen: { type: 'developer' }, query: 'sample' }),
      pageCommands: [normal, developer],
    })
    expect(
      developerRows
        .filter(({ action }) => action.type === 'page')
        .map(({ action }) => action),
    ).toEqual([{ type: 'page', command: developer }])
  })

  it('folds a name result’s actions into its row and follows it with registration when available', () => {
    const data = makeData({
      suggestions: [makeSuggestion(BOB.name)],
      availableNames: [makeSuggestion(BOB.name)],
    })
    const rows = run({ frame: makeFrame({ query: BOB.name }), data })
    expect(rows.map(({ action }) => action.type)).toEqual(['view', 'command'])
    expect(rows[0]?.actionsFor).toEqual(BOB)
    expect(commandIds(rows)).toEqual(['name.register'])
    expect(rows.some(({ action }) => action.type === 'actions')).toBe(false)
    const secondary = rows[0] && getSecondaryRow(rows[0])
    expect(secondary?.action).toEqual({ type: 'actions', entity: BOB })
    expect(rows[1] && getSecondaryRow(rows[1])).toBeUndefined()
  })

  it('names the target in titles only where the chip or group heading does not', () => {
    const titleOf = (rows: ReturnType<typeof run>, id: string) =>
      rows.find(
        ({ action }) => action.type === 'command' && action.command.id === id,
      )?.title
    const scoped = run({
      frame: makeFrame({ screen: { type: 'entity', entity: ALICE } }),
    })
    expect(titleOf(scoped, 'name.copy')).toBe('Copy name')
    const context: PaletteContext = {
      chainId: 1,
      developerEnabled: false,
      entity: ALICE,
      walletAddress: ADDRESS,
    }
    const current = run({ context })
    expect(titleOf(current, 'name.edit-records')).toBe('Edit records')
    expect(
      current.find(({ group }) => group === 'Current name')?.groupDetail,
    ).toBe(ALICE.name)
    const searched = run({ context, frame: makeFrame({ query: 'website' }) })
    expect(titleOf(searched, 'name.edit-records')).toBe(
      'Edit records for alice.eth',
    )
  })

  describe('related names and addresses', () => {
    const OWNER = { type: 'address', address: ADDRESS } as const
    const RESOLVER = {
      type: 'address',
      address: '0x0000000000000000000000000000000000000002',
    } as const
    const related: readonly PaletteRelatedEntity[] = [
      { entity: OWNER, relations: ['owner', 'eth-address'] },
      { entity: RESOLVER, relations: ['resolver'] },
    ]
    const relatedRows = (rows: ReturnType<typeof run>) =>
      rows.filter(({ group }) => group === 'Related')

    it('keeps View and suggestions ahead of related destinations with their own actions', () => {
      const rows = run({
        frame: makeFrame({ screen: { type: 'entity', entity: ALICE } }),
        related,
      })
      expect([...new Set(rows.map(({ group }) => group))]).toEqual([
        'Open',
        'Suggested',
        'Related',
        'Go to',
        'Actions',
      ])
      expect(
        relatedRows(rows).map(({ meta, action, actionsFor }) => [
          meta?.text,
          action,
          actionsFor,
        ]),
      ).toEqual([
        [
          'Owner · ETH address',
          { type: 'view', entity: OWNER, resolver: false },
          OWNER,
        ],
        [
          'Resolver',
          { type: 'view', entity: RESOLVER, resolver: true },
          undefined,
        ],
      ])
    })

    it('surfaces the current page’s relations only for a matching query', () => {
      const context: PaletteContext = {
        chainId: 1,
        developerEnabled: false,
        entity: ALICE,
      }
      expect(relatedRows(run({ context, related }))).toEqual([])
      const searched = run({
        context,
        related,
        frame: makeFrame({ query: 'owner' }),
        data: makeData({ suggestions: [makeSuggestion('owner.eth')] }),
      })
      expect([...new Set(searched.map(({ group }) => group))]).toEqual([
        'Go to',
        'Related',
        'Names and addresses',
      ])
      const owner = relatedRows(searched)
      expect(
        owner.map(({ title, groupDetail }) => [title, groupDetail]),
      ).toEqual([[ADDRESS, ALICE.name]])
      expect(
        relatedRows(
          run({ context, related, frame: makeFrame({ query: '>owner' }) }),
        ),
      ).toEqual([])
    })
  })

  it.each([
    ['a name result', makeFrame({ query: BOB.name }), 'view', 'Open name'],
    [
      'a copy action',
      makeFrame({ query: 'copy namehash' }),
      'name.copy-namehash',
      'Copy',
    ],
    [
      'an action that still needs a name',
      makeFrame({ query: 'renew' }),
      'name.renew',
      'Choose name',
    ],
  ] as const)('labels what Enter does on %s', (_, frame, key, label) => {
    const rows = run({
      frame,
      data: makeData({ suggestions: [makeSuggestion(BOB.name)] }),
    })
    const row = rows.find(({ action }) =>
      action.type === 'command'
        ? action.command.id === key
        : action.type === key,
    )
    expect(row && getRowEnterLabel(row)).toBe(label)
  })
})
