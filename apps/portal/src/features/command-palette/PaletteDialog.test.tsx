import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render as renderWithQueries,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactNode, useReducer } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PALETTE_COMMANDS } from './catalog'
import {
  type PaletteFrame,
  type PaletteState,
  paletteReducer,
} from './core/state'
import { PaletteDialog } from './PaletteDialog'
import { getPalettePresentation } from './presentation'
import type { PaletteRow } from './resultModel'

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useEnsAvatar: () => ({ data: undefined, error: null, isLoading: false }),
}))

const render = (ui: ReactNode) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return renderWithQueries(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

const ENTITY = { type: 'name', name: 'alice.eth' } as const

const makeRow = (overrides: Partial<PaletteRow> = {}): PaletteRow => ({
  id: 'view:alice.eth',
  title: 'alice.eth',
  group: 'Names',
  leading: { type: 'entity', entity: ENTITY },
  action: { type: 'view', entity: ENTITY },
  ...overrides,
})

const VIEW = makeRow()
const ACTIONS = makeRow({
  id: 'actions:alice.eth',
  title: 'Actions for alice.eth…',
  action: { type: 'actions', entity: ENTITY },
})
const registerCommand = PALETTE_COMMANDS.find(
  ({ id }) => id === 'name.register',
)
if (!registerCommand)
  throw new Error('Registration command is required for this journey')
const REGISTER = makeRow({
  id: 'register:alice.eth',
  title: 'Register alice.eth…',
  leading: { type: 'icon', icon: 'register' },
  action: { type: 'command', command: registerCommand, entity: ENTITY },
})

const makeFrame = (overrides: Partial<PaletteFrame> = {}): PaletteFrame => ({
  screen: { type: 'root' },
  query: '',
  selectedId: '',
  scrollTop: 0,
  ...overrides,
})

const makeOpenState = (
  current = makeFrame(),
  history: readonly PaletteFrame[] = [],
): PaletteState => ({
  status: 'open',
  current,
  history,
})

const Harness = ({
  rows,
  initialState = makeOpenState(),
  onActivate,
  onBack,
  onClose,
}: {
  readonly rows:
    | readonly PaletteRow[]
    | ((frame: PaletteFrame) => readonly PaletteRow[])
  readonly initialState?: PaletteState
  readonly onActivate?: (row: PaletteRow) => void
  readonly onBack?: () => void
  readonly onClose?: () => void
}) => {
  const [state, dispatch] = useReducer(paletteReducer, initialState)
  const frame = state.status === 'open' ? state.current : undefined
  const presentation = getPalettePresentation(
    frame ?? makeFrame(),
    PALETTE_COMMANDS,
  )
  const visibleRows =
    typeof rows === 'function' ? rows(frame ?? makeFrame()) : rows
  return (
    <PaletteDialog
      isOpen={state.status === 'open'}
      frame={frame}
      rows={visibleRows}
      {...presentation}
      canGoBack={state.status === 'open' && state.history.length > 0}
      onClose={() => {
        onClose?.()
        dispatch({ type: 'close' })
      }}
      onBack={() => {
        onBack?.()
        dispatch({ type: 'back' })
      }}
      onQueryChange={(query) => dispatch({ type: 'query', query })}
      onSelectionChange={(selectedId) =>
        dispatch({ type: 'select', selectedId })
      }
      onScroll={(scrollTop) => dispatch({ type: 'scroll', scrollTop })}
      onActivate={(row) => {
        onActivate?.(row)
        if (row.action.type === 'actions')
          dispatch({
            type: 'push',
            screen: { type: 'entity', entity: row.action.entity },
          })
      }}
      onClosed={() => {}}
      onRetry={() => {}}
      onClearHistory={() => {}}
    />
  )
}

describe('PaletteDialog', () => {
  it('shows a full address inline with Copy and keeps activation on the row', async () => {
    const address = '0x1111111111111111111111111111111111111111'
    const copy = makeRow({
      title: 'Copy',
      inlineAddress: address,
      leading: { type: 'icon', icon: 'copy' },
      action: { type: 'copy', value: address, label: 'Address' },
    })
    const onActivate = vi.fn()
    const user = userEvent.setup()
    render(<Harness rows={[copy]} onActivate={onActivate} />)
    const option = screen.getByRole('option')
    expect(within(option).getByText(address)).toBeVisible()
    expect(within(option).queryByRole('button')).not.toBeInTheDocument()
    expect(within(option).queryByRole('link')).not.toBeInTheDocument()
    await user.click(option)
    expect(onActivate).toHaveBeenCalledExactlyOnceWith(copy)
  })

  it('uses Left Arrow to go back only at the start of an unmodified caret', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(
      <Harness
        rows={[REGISTER]}
        initialState={makeOpenState(
          makeFrame({
            query: 'copy',
            screen: { type: 'entity', entity: ENTITY },
          }),
          [makeFrame({ query: 'helgesson.eth' })],
        )}
        onBack={onBack}
      />,
    )
    const input = screen.getByRole('combobox')
    await user.click(input)
    await user.keyboard('{End}{ArrowLeft}')
    expect(input).toHaveValue('copy')
    expect(onBack).not.toHaveBeenCalled()
    await user.keyboard('{Home}{Shift>}{ArrowLeft}{/Shift}')
    expect(onBack).not.toHaveBeenCalled()
    screen.getByRole<HTMLInputElement>('combobox').setSelectionRange(0, 2)
    await user.keyboard('{ArrowLeft}')
    expect(onBack).not.toHaveBeenCalled()
    await user.keyboard('{Home}{ArrowLeft}')
    expect(onBack).toHaveBeenCalledOnce()
    expect(input).toHaveValue('helgesson.eth')
    expect(input).toHaveFocus()
  })

  it('keeps address badges inert inside options, with palette activation owning navigation', async () => {
    const entity = {
      type: 'address',
      address: '0x1111111111111111111111111111111111111111',
    } as const
    const resolver = makeRow({
      id: 'resolver',
      title: entity.address,
      leading: { type: 'entity', entity, variant: 'contract' },
      action: { type: 'view', entity, resolver: true },
    })
    const onActivate = vi.fn()
    const user = userEvent.setup()
    render(<Harness rows={[resolver]} onActivate={onActivate} />)
    const option = screen.getByRole('option')
    await user.hover(option)
    expect(within(option).queryByRole('link')).not.toBeInTheDocument()
    expect(within(option).queryByRole('button')).not.toBeInTheDocument()
    await user.click(option)
    expect(onActivate).toHaveBeenCalledExactlyOnceWith(resolver)
  })

  it('changes hover selection only after actual pointer movement or a deliberate press', async () => {
    const user = userEvent.setup()
    const onActivate = vi.fn()
    render(<Harness rows={[VIEW, ACTIONS]} onActivate={onActivate} />)
    const actions = screen.getAllByRole('option')[1]
    fireEvent.pointerEnter(actions)
    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{Enter}')
    expect(onActivate).toHaveBeenLastCalledWith(VIEW)
    fireEvent.pointerMove(actions, { pointerType: 'mouse' })
    await user.keyboard('{Enter}')
    expect(onActivate).toHaveBeenLastCalledWith(ACTIONS)
  })

  it('keeps the selected View action fixed when registration and metadata arrive', async () => {
    const onActivate = vi.fn<(row: PaletteRow) => void>()
    const user = userEvent.setup()
    const initialState = makeOpenState(makeFrame({ selectedId: VIEW.id }))
    const { rerender } = render(
      <Harness
        rows={[VIEW, ACTIONS]}
        initialState={initialState}
        onActivate={onActivate}
      />,
    )
    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{Enter}')

    rerender(
      <Harness
        rows={[
          { ...VIEW, meta: { text: 'Available', tone: 'positive' } },
          REGISTER,
          ACTIONS,
        ]}
        initialState={initialState}
        onActivate={onActivate}
      />,
    )
    await user.keyboard('{Enter}')
    expect(onActivate.mock.calls.map(([row]) => row.action.type)).toEqual([
      'view',
      'view',
    ])
  })

  it('requires deliberate selection after the selected item disappears', async () => {
    const onActivate = vi.fn<(row: PaletteRow) => void>()
    const user = userEvent.setup()
    const initialState = makeOpenState(makeFrame({ selectedId: REGISTER.id }))
    const { rerender } = render(
      <Harness
        rows={[VIEW, REGISTER]}
        initialState={initialState}
        onActivate={onActivate}
      />,
    )
    await user.click(screen.getByRole('combobox'))
    rerender(
      <Harness
        rows={[VIEW]}
        initialState={initialState}
        onActivate={onActivate}
      />,
    )
    await user.keyboard('{Enter}')
    expect(onActivate).not.toHaveBeenCalled()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onActivate).toHaveBeenCalledWith(VIEW)
  })

  it('navigates in the visible grouped order when ranked rows interleave groups', async () => {
    const onActivate = vi.fn<(row: PaletteRow) => void>()
    const user = userEvent.setup()
    const otherName = makeRow({
      id: 'view:bob.eth',
      title: 'bob.eth',
      action: { type: 'view', entity: { type: 'name', name: 'bob.eth' } },
    })
    const action = makeRow({ ...REGISTER, group: 'Actions' })
    render(<Harness rows={[VIEW, action, otherName]} onActivate={onActivate} />)
    expect(
      screen
        .getAllByRole('option')
        .map((row) => row.getAttribute('data-value')),
    ).toEqual([VIEW.id, otherName.id, action.id])
    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onActivate).toHaveBeenCalledWith(otherName)
  })

  it.each(['Enter', 'Escape', 'Backspace', 'ArrowLeft'])(
    'preserves the active step when %s belongs to text composition',
    async (key) => {
      const onActivate = vi.fn<(row: PaletteRow) => void>()
      const onBack = vi.fn()
      const onClose = vi.fn()
      const user = userEvent.setup()
      render(
        <Harness
          rows={[VIEW]}
          initialState={makeOpenState(
            makeFrame({ screen: { type: 'entity', entity: ENTITY } }),
            [makeFrame({ query: 'alice' })],
          )}
          onActivate={onActivate}
          onBack={onBack}
          onClose={onClose}
        />,
      )
      const input = screen.getByRole('combobox')
      await user.click(input)
      fireEvent.keyDown(input, { key, isComposing: true })
      expect(onActivate).not.toHaveBeenCalled()
      expect(onBack).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
      expect(input).toHaveValue('')
    },
  )

  it('opens the explicit actions scope and restores the root frame with Back', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        rows={(frame) =>
          frame.screen.type === 'root' ? [VIEW, ACTIONS] : [REGISTER]
        }
        initialState={makeOpenState(
          makeFrame({ query: 'alice', selectedId: ACTIONS.id, scrollTop: 37 }),
        )}
      />,
    )
    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{Enter}')
    expect(screen.getByRole('combobox')).toHaveValue('')
    expect(
      screen.getByText('alice.eth', { selector: '[data-palette-scope]' }),
    ).toBeInTheDocument()
    await user.type(screen.getByRole('combobox'), 'register')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('combobox')).toHaveValue('alice')
    expect(screen.getByRole('option', { selected: true })).toHaveAttribute(
      'data-value',
      ACTIONS.id,
    )
    expect(screen.getByRole('listbox').scrollTop).toBe(37)
    await user.keyboard(' copy')
    expect(screen.getByRole('combobox')).toHaveValue('alice copy')
  })

  it('keeps actionable controls outside listbox options', () => {
    render(<Harness rows={[VIEW, ACTIONS, REGISTER]} />)
    for (const row of screen.getAllByRole('option')) {
      expect(row.querySelector('button, a, input, select, textarea')).toBeNull()
    }
    expect(
      screen.getByRole('button', { name: 'Close search' }),
    ).toBeInTheDocument()
  })

  describe('name actions on the result row', () => {
    const NAME = makeRow({ actionsFor: ENTITY })
    const openedActions = (onActivate: ReturnType<typeof vi.fn>) =>
      onActivate.mock.calls.map(([row]) => row.action.type)

    it('opens actions with Right Arrow at the end of the query while Enter still views the name', async () => {
      const onActivate = vi.fn<(row: PaletteRow) => void>()
      const user = userEvent.setup()
      render(
        <Harness
          rows={(frame) => (frame.screen.type === 'root' ? [NAME] : [REGISTER])}
          initialState={makeOpenState(makeFrame({ query: 'alice' }))}
          onActivate={onActivate}
        />,
      )
      const input = screen.getByRole('combobox')
      await user.click(input)
      await user.keyboard('{Home}{ArrowRight}')
      expect(onActivate).not.toHaveBeenCalled()
      await user.keyboard('{End}{Enter}{ArrowRight}')
      expect(openedActions(onActivate)).toEqual(['view', 'actions'])
      expect(onActivate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: { type: 'actions', entity: ENTITY },
        }),
      )
      expect(
        screen.getByText('alice.eth', { selector: '[data-palette-scope]' }),
      ).toBeInTheDocument()
    })

    it('leaves Tab and Shift+Tab to move focus without opening actions', async () => {
      const onActivate = vi.fn<(row: PaletteRow) => void>()
      const user = userEvent.setup()
      render(
        <Harness
          rows={(frame) => (frame.screen.type === 'root' ? [NAME] : [REGISTER])}
          initialState={makeOpenState(makeFrame({ query: 'alice' }))}
          onActivate={onActivate}
        />,
      )
      await user.click(screen.getByRole('combobox'))
      await user.keyboard('{Shift>}{Tab}{/Shift}')
      expect(onActivate).not.toHaveBeenCalled()
      screen.getByRole('combobox').focus()
      await user.keyboard('{Home}{Tab}')
      expect(onActivate).not.toHaveBeenCalled()
      expect(screen.getByRole('combobox')).not.toHaveFocus()
    })

    it('opens actions from the inline button without viewing the name', async () => {
      const onActivate = vi.fn<(row: PaletteRow) => void>()
      const user = userEvent.setup()
      render(<Harness rows={[NAME]} onActivate={onActivate} />)
      await user.click(
        screen.getByRole('button', { name: 'Actions for alice.eth' }),
      )
      expect(openedActions(onActivate)).toEqual(['actions'])
    })

    it('treats a click on the row pill as actions, not as the row', () => {
      const onActivate = vi.fn<(row: PaletteRow) => void>()
      render(<Harness rows={[NAME]} onActivate={onActivate} />)
      const button = screen.getByRole('button', {
        name: 'Actions for alice.eth',
      })
      expect(screen.getByRole('option')).not.toContainElement(button)
      fireEvent.click(button)
      expect(openedActions(onActivate)).toEqual(['actions'])
    })

    it('shows primary and secondary keyboard labels inline without a footer', () => {
      render(<Harness rows={[NAME]} />)
      const option = screen.getByRole('option')
      expect(within(option).getByText('Open name')).toBeInTheDocument()
      expect(within(option).getByText('↵')).toBeInTheDocument()
      const actions = screen.getByRole('button', {
        name: 'Actions for alice.eth',
      })
      expect(within(actions).getByText('→')).toBeInTheDocument()
      expect(screen.queryByText('Actions only')).not.toBeInTheDocument()
    })

    it('offers no actions shortcut for rows without a name target', async () => {
      const onActivate = vi.fn<(row: PaletteRow) => void>()
      const user = userEvent.setup()
      render(<Harness rows={[REGISTER]} onActivate={onActivate} />)
      expect(
        screen.queryByRole('button', { name: /^Actions for/ }),
      ).not.toBeInTheDocument()
      await user.click(screen.getByRole('combobox'))
      await user.keyboard('{ArrowRight}')
      expect(onActivate).not.toHaveBeenCalled()
    })
  })

  it('scrolls the keyboard selection into view, with its heading when it starts a group', async () => {
    const scrolled: string[] = []
    const spy = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(function (this: Element) {
        scrolled.push(this.getAttribute('data-value') ?? 'heading')
      })
    const user = userEvent.setup()
    render(<Harness rows={[VIEW, ACTIONS, REGISTER]} />)
    await user.click(screen.getByRole('combobox'))
    const fromKeyboard = scrolled.length
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(scrolled.slice(fromKeyboard)).toEqual([
      ACTIONS.id,
      REGISTER.id,
      'heading',
      VIEW.id,
    ])
    spy.mockRestore()
  })
})
