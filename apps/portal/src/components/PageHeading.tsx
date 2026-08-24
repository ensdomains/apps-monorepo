import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { Address } from 'viem'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

/**
 * A Name inside an `h1` is ABC Marist 36/38 rather than the Grotesk `h1`.
 * Exported so the Name Overview title and the breadcrumb crumb stay identical.
 */
export const nameHeadingClassName = 'font-serif text-h1-name'

/**
 * Wallet and contract addresses in an `h1` keep the `h1` metrics but switch to
 * Monument Grotesk Semi-Mono.
 */
export const addressHeadingClassName = 'font-semi-mono'

/**
 * The overview page a subpage hangs off, rendered as the first breadcrumb
 * segment of the subpage's `h1`.
 *
 * Modelled as a union rather than raw link options so a crumb can't point at a
 * route that has no overview, and so each crumb's label matches the title of
 * the overview it links to — a name, the wallet's truncated hex, or the
 * contract's title.
 */
export type PageHeadingParent =
  | { readonly type: 'name'; readonly name: string }
  | { readonly type: 'addr'; readonly addr: Address }
  | { readonly type: 'registry'; readonly address: Address }
  | { readonly type: 'resolver'; readonly address: Address }

// Hover is an underline, not a colour shift: both crumb and page title sit at
// full heading contrast in every state (Figma node 2471:43259).
const parentLinkClassName =
  'hover:underline focus-visible:underline [text-underline-position:from-font] rounded-xs outline-none'

const ParentCrumbLabel = ({
  parent,
}: {
  readonly parent: PageHeadingParent
}) => {
  switch (parent.type) {
    case 'name':
      return <span className={nameHeadingClassName}>{parent.name}</span>
    case 'addr':
      return (
        <span className={addressHeadingClassName}>
          {truncateAddress(parent.addr)}
        </span>
      )
    case 'registry':
      return <>Registry Contract</>
    case 'resolver':
      return (
        <>
          Resolver{' '}
          <span className={addressHeadingClassName}>
            {truncateAddress(parent.address)}
          </span>
        </>
      )
  }
}

const ParentCrumb = ({ parent }: { readonly parent: PageHeadingParent }) => {
  const label = <ParentCrumbLabel parent={parent} />

  switch (parent.type) {
    case 'name':
      return (
        <Link
          to="/$name"
          params={{ name: parent.name }}
          className={parentLinkClassName}
        >
          {label}
        </Link>
      )
    case 'addr':
      return (
        <Link
          to="/addr/$addr"
          params={{ addr: parent.addr }}
          className={parentLinkClassName}
        >
          {label}
        </Link>
      )
    case 'registry':
      return (
        <Link
          to="/registry/$address"
          params={{ address: parent.address }}
          className={parentLinkClassName}
        >
          {label}
        </Link>
      )
    case 'resolver':
      return (
        <Link
          to="/resolver/$address"
          params={{ address: parent.address }}
          className={parentLinkClassName}
        >
          {label}
        </Link>
      )
  }
}

/**
 * The page `h1`. On a subpage of a Name, Wallet or Contract overview, pass
 * `parent` to prefix the title with a breadcrumb back to that overview
 * (`jooooe.eth / Records (4)`) — Thomas Clowes' navigation feedback. Overview
 * pages render their own title through the same component, without `parent`,
 * so every page title shares one type spec.
 *
 * Both segments render at full heading contrast; only the crumb underlines on
 * hover, which is what marks it as the interactive half.
 */
export const PageHeading = ({
  parent,
  children,
  className,
}: {
  readonly parent?: PageHeadingParent
  readonly children: ReactNode
  readonly className?: string
}) => (
  <h1
    className={cn(
      'text-h1 flex flex-wrap items-baseline gap-x-2 min-w-0 break-words',
      className,
    )}
  >
    {parent && (
      <>
        <ParentCrumb parent={parent} />
        <span aria-hidden="true">/</span>
      </>
    )}
    <span className="min-w-0">{children}</span>
  </h1>
)
