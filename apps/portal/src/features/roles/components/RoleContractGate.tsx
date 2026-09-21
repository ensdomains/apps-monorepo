import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { MessageCard } from '@/components/ui/message-card'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { getRoleContractKindQueryOptions } from '../queries/getRoleContractKind'
import type { RoleContractKind } from '../utils/roleContractKind'

type ExpectedKind = Exclude<RoleContractKind, 'unsupported'>

type RoleContractGateProps = {
  readonly address: Address
  readonly expected: ExpectedKind
  /**
   * `page` explains the refusal and links to the editor that does match;
   * `embedded` (a read-only table inside another page) just says why nothing
   * is shown.
   */
  readonly variant?: 'page' | 'embedded'
  readonly children: ReactNode
}

const LABELS: Record<
  ExpectedKind,
  {
    readonly noun: string
    readonly title: string
    readonly action: string
    readonly emptyTitle: string
    readonly path: '/registry/$address/roles' | '/resolver/$address/roles'
  }
> = {
  registry: {
    noun: 'an ENS registry',
    title: 'Not a registry',
    action: 'Open registry roles',
    emptyTitle: 'No registry roles',
    path: '/registry/$address/roles',
  },
  'permissioned-resolver': {
    noun: 'an ENS permissioned resolver',
    title: 'Not a permissioned resolver',
    action: 'Open resolver roles',
    emptyTitle: 'No resolver roles',
    path: '/resolver/$address/roles',
  },
}

/**
 * Renders `children` only when `address` uses the `expected` role model.
 * Registries and PermissionedResolvers share `EnhancedAccessControl`, so the
 * other model's role editor would encode a bitmap whose bits mean something
 * else on this contract.
 */
export const RoleContractGate = ({
  address,
  expected,
  variant = 'page',
  children,
}: RoleContractGateProps) => {
  const {
    data: kind,
    isLoading,
    error,
  } = useQuery(getRoleContractKindQueryOptions({ address }))

  if (isLoading) return <LoadingSpinner title="Checking contract..." />

  if (error)
    return (
      <ErrorMessage
        compact
        description="Couldn't check what kind of contract this is. Please refresh the page."
      />
    )

  if (kind === expected) return children

  const actual = kind ?? 'unsupported'
  const shortAddress = truncateAddress(address, 6, 4)

  if (variant === 'embedded')
    return (
      <NoResultsMessage
        className="mx-0"
        title={LABELS[expected].emptyTitle}
        description={`${shortAddress} isn't ${LABELS[expected].noun}, so there are no roles to show here.`}
      />
    )

  return (
    <RoleContractMismatch
      address={address}
      shortAddress={shortAddress}
      expected={expected}
      actual={actual}
    />
  )
}

const RoleContractMismatch = ({
  address,
  shortAddress,
  expected,
  actual,
}: {
  readonly address: Address
  readonly shortAddress: string
  readonly expected: ExpectedKind
  readonly actual: RoleContractKind
}) => {
  const navigate = useNavigate()

  return match(actual)
    .with('unsupported', () => (
      <MessageCard
        variant="warning"
        icon={<ShieldAlert className="size-6" strokeWidth={1.5} />}
        title={LABELS[expected].title}
        description={`${shortAddress} isn't ${LABELS[expected].noun}, so its roles can't be shown or managed here.`}
      />
    ))
    .with('registry', 'permissioned-resolver', (other) => (
      <MessageCard
        variant="warning"
        icon={<ShieldAlert className="size-6" strokeWidth={1.5} />}
        title={LABELS[expected].title}
        description={`${shortAddress} is ${LABELS[other].noun}. Its roles use a different permission set, so they're managed on its own roles page.`}
        actionButton={{
          label: LABELS[other].action,
          onClick: () =>
            void navigate({ to: LABELS[other].path, params: { address } }),
        }}
      />
    ))
    .exhaustive()
}
