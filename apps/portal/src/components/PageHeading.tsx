import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { Address } from 'viem'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

export const nameHeadingClassName =
  'font-serif text-4xl font-medium leading-none'

export const addressHeadingClassName = 'font-semi-mono'

export type PageHeadingParent =
  | { readonly type: 'name'; readonly name: string }
  | { readonly type: 'addr'; readonly addr: Address }
  | { readonly type: 'registry'; readonly address: Address }
  | { readonly type: 'resolver'; readonly address: Address }

const parentLinkClassName =
  'hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring [text-underline-position:from-font] rounded-xs outline-none'

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

/** Page `h1`. Pass `parent` on a subpage to prefix a breadcrumb back to its overview. */
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
      'font-sans text-page-title leading-9.5 font-normal',
      'flex flex-wrap items-baseline gap-x-2 min-w-0 break-words',
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
