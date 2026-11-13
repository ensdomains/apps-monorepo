import { Trans } from '@lingui/react/macro'
import type { ReactNode } from 'react'

const ExplorerLink = ({
  href,
  children,
}: {
  readonly href: string | null
  readonly children: ReactNode
}) =>
  href ? (
    <a
      className="underline"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  ) : (
    children
  )

/** Rhinestone refused to quote for gas; "Explorer" links to this name there when the network has one. */
export const GasRefusalWarning = ({
  explorerRegisterUrl,
}: {
  readonly explorerRegisterUrl: string | null
}) => (
  <Trans>
    Network fees are elevated right now, if you'd still like to register this
    name, please use the{' '}
    <ExplorerLink href={explorerRegisterUrl}>Explorer</ExplorerLink>
  </Trans>
)
