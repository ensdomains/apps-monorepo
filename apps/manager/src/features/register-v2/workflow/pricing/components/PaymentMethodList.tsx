import { Trans, useLingui } from '@lingui/react/macro'
import { SearchIcon, XIcon } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

const SUGGESTED_TOKEN_ORDER = ['USDC', 'DAI', 'WETH', 'ENS'] as const
const suggestedTokenRank: ReadonlyMap<string, number> = new Map(
  SUGGESTED_TOKEN_ORDER.map((symbol, index) => [symbol, index]),
)

export type PaymentMethodListItem = {
  readonly id: string
  readonly isSelected: boolean
  readonly content: React.ReactNode
  /** Token symbol. Its presence puts the row in the token sections. */
  readonly tokenSymbol?: string
  /** Symbol, name, address and network text used by the selector search. */
  readonly searchText?: string
}

const matchesSearch = (item: PaymentMethodListItem, search: string) =>
  `${item.tokenSymbol ?? ''} ${item.searchText ?? ''} ${item.id}`
    .toLocaleLowerCase()
    .includes(search)

const Section = ({
  label,
  items,
}: {
  readonly label: React.ReactNode
  readonly items: readonly PaymentMethodListItem[]
}) =>
  items.length > 0 && (
    <section className="flex flex-col gap-1">
      <h3 className="px-3 pt-2 font-medium text-ens-quartz-400 text-xs uppercase tracking-wide">
        {label}
      </h3>
      <ul className="flex w-full list-none flex-col p-0">
        {items.map((item) => (
          <li key={item.id}>{item.content}</li>
        ))}
      </ul>
    </section>
  )

/**
 * A compact payment selector inspired by CoW Swap: fixed viewport, persistent
 * search and balance-backed sections. The list scrolls; the checkout does not
 * grow when a wallet owns many tokens.
 */
export const PaymentMethodList = ({
  items,
}: {
  readonly items: readonly PaymentMethodListItem[]
}) => {
  const { t } = useLingui()
  const [searchInput, setSearchInput] = useState('')
  const search = useDeferredValue(searchInput.trim().toLocaleLowerCase())

  const { suggested, wallet, other, results } = useMemo(() => {
    const tokenItems = items.filter((item) => item.tokenSymbol)
    const suggested = tokenItems
      .filter((item) => suggestedTokenRank.has(item.tokenSymbol ?? ''))
      .sort(
        (left, right) =>
          (suggestedTokenRank.get(left.tokenSymbol ?? '') ?? 1_000) -
          (suggestedTokenRank.get(right.tokenSymbol ?? '') ?? 1_000),
      )
    const suggestedIds = new Set(suggested.map((item) => item.id))
    return {
      suggested,
      wallet: tokenItems.filter((item) => !suggestedIds.has(item.id)),
      other: items.filter((item) => !item.tokenSymbol),
      results: search
        ? items.filter((item) => matchesSearch(item, search))
        : [],
    }
  }, [items, search])

  const hasSearch = search.length > 0

  return (
    <div className="flex h-[32dvh] max-h-64 min-h-44 w-full flex-col overflow-hidden rounded-lg border border-ens-quartz-200 bg-white">
      <label className="relative m-3 mb-2 flex h-11 shrink-0 items-center rounded-full bg-ens-quartz-75">
        <SearchIcon
          aria-hidden="true"
          className="ml-4 size-4 shrink-0 text-ens-quartz-400"
        />
        <span className="sr-only">
          <Trans>Search tokens</Trans>
        </span>
        <input
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-ens-quartz-900 text-sm outline-none placeholder:text-ens-quartz-400"
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t`Search tokens`}
          type="search"
          value={searchInput}
        />
        <button
          aria-label={t`Clear search`}
          className={cn(
            'mr-2 flex size-8 shrink-0 items-center justify-center rounded-full text-ens-quartz-400 outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-ens-blue',
            !searchInput && 'invisible',
          )}
          onClick={() => setSearchInput('')}
          type="button"
        >
          <XIcon aria-hidden="true" className="size-4" />
        </button>
      </label>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 [scrollbar-gutter:stable]">
        {hasSearch ? (
          results.length > 0 ? (
            <Section items={results} label={<Trans>Search results</Trans>} />
          ) : (
            <p className="px-4 py-8 text-center text-ens-quartz-400 text-sm">
              <Trans>No tokens found</Trans>
            </p>
          )
        ) : (
          <>
            <Section items={suggested} label={<Trans>Suggested</Trans>} />
            <Section items={wallet} label={<Trans>Your tokens</Trans>} />
            <Section items={other} label={<Trans>Other ways to pay</Trans>} />
          </>
        )}
      </div>
    </div>
  )
}
